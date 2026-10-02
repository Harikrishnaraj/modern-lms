import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLiveProject = Boolean(url && anonKey && serviceRoleKey);

// RLS + column-privilege checks for the T-030 course schema against the live project.
describe.skipIf(!hasLiveProject)("courses schema RLS (T-030, live Supabase)", () => {
  const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
  const anon = () => createClient(url!, anonKey!, noPersist);
  const password = "correct horse battery staple 1";
  const svc = hasLiveProject ? createClient(url!, serviceRoleKey!, noPersist) : (null as never);
  const tag = `t030-${Date.now()}`;
  const courseIds: string[] = [];

  async function makeUser(name: string, role: string) {
    const email = `${tag}-${name}@example.com`;
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await svc.from("user_roles").delete().eq("user_id", data.user.id);
    await svc.from("user_roles").insert({ user_id: data.user.id, role_id: role });
    const client = anon();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { id: data.user.id, client };
  }

  let instructorA: Awaited<ReturnType<typeof makeUser>>;
  let instructorB: Awaited<ReturnType<typeof makeUser>>;
  let learner: Awaited<ReturnType<typeof makeUser>>;
  let otherLearner: Awaited<ReturnType<typeof makeUser>>;
  let reviewer: Awaited<ReturnType<typeof makeUser>>;

  // Seeded via the service role: a published free course, a published paid course, a draft.
  const ids = {} as Record<string, string>;

  async function seedCourse(
    key: string,
    instructorId: string,
    opts: { price: number; publish: boolean },
  ) {
    const { data: course } = await svc
      .from("courses")
      .insert({ slug: `${tag}-${key}`, instructor_id: instructorId })
      .select("id")
      .single();
    courseIds.push(course!.id);
    const { data: version } = await svc
      .from("course_versions")
      .insert({
        course_id: course!.id,
        version_number: 1,
        title: `${key} course`,
        price_cents: opts.price,
      })
      .select("id")
      .single();
    const { data: section } = await svc
      .from("course_sections")
      .insert({ version_id: version!.id, title: "Intro", position: 0 })
      .select("id")
      .single();
    const { data: lessons } = await svc
      .from("lessons")
      .insert([
        {
          section_id: section!.id,
          title: "Preview lesson",
          position: 0,
          content: "free",
          is_preview: true,
        },
        {
          section_id: section!.id,
          title: "Locked lesson",
          position: 1,
          content: "secret",
          is_preview: false,
        },
      ])
      .select("id, is_preview");
    if (opts.publish) {
      await svc.from("course_versions").update({ status: "published" }).eq("id", version!.id);
      await svc.from("courses").update({ published_version_id: version!.id }).eq("id", course!.id);
    }
    ids[`${key}Course`] = course!.id;
    ids[`${key}Version`] = version!.id;
    ids[`${key}Section`] = section!.id;
    ids[`${key}Preview`] = lessons!.find((l) => l.is_preview)!.id;
    ids[`${key}Locked`] = lessons!.find((l) => !l.is_preview)!.id;
  }

  beforeAll(async () => {
    [instructorA, instructorB, learner, otherLearner, reviewer] = await Promise.all([
      makeUser("ia", "instructor"),
      makeUser("ib", "instructor"),
      makeUser("l1", "learner"),
      makeUser("l2", "learner"),
      makeUser("rv", "content_reviewer"),
    ]);
    await seedCourse("free", instructorA.id, { price: 0, publish: true });
    await seedCourse("paid", instructorA.id, { price: 4900, publish: true });
    await seedCourse("draft", instructorA.id, { price: 0, publish: false });
  }, 200_000);

  afterAll(async () => {
    // enrollments.course_id has no cascade: remove learners (cascades enrollments) first.
    await Promise.all([learner, otherLearner].map((u) => svc.auth.admin.deleteUser(u.id)));
    await svc.from("courses").delete().in("id", courseIds);
    await Promise.all(
      [instructorA, instructorB, reviewer].map((u) => svc.auth.admin.deleteUser(u.id)),
    );
  }, 200_000);

  describe("anonymous visitors", () => {
    it("read categories and published courses only", async () => {
      const client = anon();
      expect((await client.from("categories").select("id")).error).toBeNull();
      const { data } = await client.from("courses").select("id").in("id", courseIds);
      expect(data?.map((c) => c.id).sort()).toEqual([ids.freeCourse, ids.paidCourse].sort());
      const versions = await client.from("course_versions").select("id").eq("id", ids.draftVersion);
      expect(versions.data).toEqual([]);
    });

    it("see preview lesson content but not locked lesson content", async () => {
      const { data } = await anon()
        .from("lessons")
        .select("id, content")
        .eq("section_id", ids.freeSection);
      expect(data).toEqual([{ id: ids.freePreview, content: "free" }]);
    });

    it("get the full curriculum outline (titles only) of a published version", async () => {
      const { data, error } = await anon().rpc("get_lesson_outline", {
        p_version_id: ids.freeVersion,
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(Object.keys(data![0])).not.toContain("content");
    });

    it("get no outline for an unpublished version", async () => {
      const { data } = await anon().rpc("get_lesson_outline", { p_version_id: ids.draftVersion });
      expect(data).toEqual([]);
    });

    it("cannot write anything", async () => {
      const { error } = await anon()
        .from("courses")
        .insert({ slug: `${tag}-x`, instructor_id: instructorA.id });
      expect(error).not.toBeNull();
    });
  });

  describe("instructors", () => {
    it("can create their own course but not one for someone else", async () => {
      const mine = await instructorA.client
        .from("courses")
        .insert({ slug: `${tag}-mine`, instructor_id: instructorA.id })
        .select("id")
        .single();
      expect(mine.error).toBeNull();
      courseIds.push(mine.data!.id);

      const theirs = await instructorA.client
        .from("courses")
        .insert({ slug: `${tag}-theirs`, instructor_id: instructorB.id });
      expect(theirs.error).not.toBeNull();
    });

    it("cannot see a draft owned by another instructor", async () => {
      const { data } = await instructorB.client
        .from("course_versions")
        .select("id")
        .eq("id", ids.draftVersion);
      expect(data).toEqual([]);
    });

    it("can see and edit their own draft content", async () => {
      const seen = await instructorA.client
        .from("course_versions")
        .select("id")
        .eq("id", ids.draftVersion);
      expect(seen.data).toHaveLength(1);
      const edit = await instructorA.client
        .from("course_versions")
        .update({ title: "Renamed draft" })
        .eq("id", ids.draftVersion)
        .select("id");
      expect(edit.data).toHaveLength(1);
      const lesson = await instructorA.client
        .from("lessons")
        .insert({ section_id: ids.draftSection, title: "New lesson", position: 2 });
      expect(lesson.error).toBeNull();
    });

    it("cannot change workflow status or the published pointer themselves", async () => {
      const status = await instructorA.client
        .from("course_versions")
        .update({ status: "published" })
        .eq("id", ids.draftVersion);
      expect(status.error).not.toBeNull();
      const pointer = await instructorA.client
        .from("courses")
        .update({ published_version_id: ids.draftVersion })
        .eq("id", ids.draftCourse);
      expect(pointer.error).not.toBeNull();
    });

    it("cannot edit content once the version is submitted", async () => {
      await svc.from("course_versions").update({ status: "submitted" }).eq("id", ids.draftVersion);
      const edit = await instructorA.client
        .from("course_versions")
        .update({ title: "Sneaky edit" })
        .eq("id", ids.draftVersion)
        .select("id");
      expect(edit.data).toEqual([]);
      const lesson = await instructorA.client
        .from("lessons")
        .insert({ section_id: ids.draftSection, title: "Sneaky lesson", position: 9 });
      expect(lesson.error).not.toBeNull();
      await svc.from("course_versions").update({ status: "draft" }).eq("id", ids.draftVersion);
    });

    it("cannot edit a published course owned by another instructor", async () => {
      const edit = await instructorB.client
        .from("course_versions")
        .update({ title: "Hijacked" })
        .eq("id", ids.freeVersion)
        .select("id");
      expect(edit.data).toEqual([]);
    });
  });

  describe("learners", () => {
    it("cannot create courses", async () => {
      const { error } = await learner.client
        .from("courses")
        .insert({ slug: `${tag}-learner`, instructor_id: learner.id });
      expect(error).not.toBeNull();
    });

    it("cannot self-enroll in a paid course or an unpublished course", async () => {
      const paid = await learner.client
        .from("enrollments")
        .insert({ user_id: learner.id, course_id: ids.paidCourse, version_id: ids.paidVersion });
      expect(paid.error).not.toBeNull();
      const draft = await learner.client
        .from("enrollments")
        .insert({ user_id: learner.id, course_id: ids.draftCourse, version_id: ids.draftVersion });
      expect(draft.error).not.toBeNull();
    });

    it("cannot enroll someone else", async () => {
      const { error } = await learner.client.from("enrollments").insert({
        user_id: otherLearner.id,
        course_id: ids.freeCourse,
        version_id: ids.freeVersion,
      });
      expect(error).not.toBeNull();
    });

    it("read locked lesson content only after enrolling, and keep progress private", async () => {
      const before = await learner.client.from("lessons").select("id").eq("id", ids.freeLocked);
      expect(before.data).toEqual([]);

      const enroll = await learner.client
        .from("enrollments")
        .insert({ user_id: learner.id, course_id: ids.freeCourse, version_id: ids.freeVersion })
        .select("id")
        .single();
      expect(enroll.error).toBeNull();

      const after = await learner.client
        .from("lessons")
        .select("id, content")
        .eq("id", ids.freeLocked);
      expect(after.data).toEqual([{ id: ids.freeLocked, content: "secret" }]);

      const progress = await learner.client.from("lesson_progress").insert({
        enrollment_id: enroll.data!.id,
        lesson_id: ids.freeLocked,
        completed_at: new Date().toISOString(),
      });
      expect(progress.error).toBeNull();

      const others = await otherLearner.client.from("lesson_progress").select("id");
      expect(others.data).toEqual([]);
      const stillLocked = await otherLearner.client
        .from("lessons")
        .select("id")
        .eq("id", ids.freeLocked);
      expect(stillLocked.data).toEqual([]);
    });

    it("cannot mark their own enrollment completed or cancelled", async () => {
      const { error } = await learner.client
        .from("enrollments")
        .update({ status: "completed" })
        .eq("user_id", learner.id);
      expect(error).not.toBeNull();
    });

    it("cannot double-enroll in the same course", async () => {
      const { error } = await learner.client
        .from("enrollments")
        .insert({ user_id: learner.id, course_id: ids.freeCourse, version_id: ids.freeVersion });
      expect(error).not.toBeNull();
    });

    it("cannot record progress on a lesson of a course they are not enrolled in", async () => {
      const { data: mine } = await learner.client
        .from("enrollments")
        .select("id")
        .limit(1)
        .single();
      const { error } = await learner.client
        .from("lesson_progress")
        .insert({ enrollment_id: mine!.id, lesson_id: ids.paidLocked });
      expect(error).not.toBeNull();
    });
  });

  describe("staff", () => {
    it("content reviewers can read drafts but not modify them", async () => {
      const seen = await reviewer.client
        .from("course_versions")
        .select("id")
        .eq("id", ids.draftVersion);
      expect(seen.data).toHaveLength(1);
      const edit = await reviewer.client
        .from("course_versions")
        .update({ title: "Reviewer edit" })
        .eq("id", ids.draftVersion)
        .select("id");
      expect(edit.data).toEqual([]);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCourseAssignment, discardAssignmentResourceUpload, requestAssignmentResourceUpload } from "@/features/assignments/hub-actions";
import { getAssignableCourses, getAssignmentOverview } from "@/features/assignments/hub";
import { getMyAssignments } from "@/features/assignments/queries";
import { getAssignmentResources } from "@/features/assignments/resources";
import { deleteAssignment } from "@/features/course-authoring/assignment-actions";
import { ASSIGNMENT_RESOURCE_BUCKET, supabaseStorage } from "@/services/storage";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PDF = "application/pdf";

// T-114 / F-206 / ADR-030: the instructor Assignments page.
describe.skipIf(!hasLiveProject)("assignments page (T-114, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ah");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const stored: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  let owner: { id: string; client: SupabaseClient };
  let rival: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let live: Awaited<ReturnType<typeof createCourse>>;
  let liveWithDraft: Awaited<ReturnType<typeof createCourse>>;
  let draftV2: string;
  let unpublished: Awaited<ReturnType<typeof createCourse>>;
  let inReview: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  async function putResource(userId: string, name = "brief.pdf") {
    const path = `${userId}/${crypto.randomUUID()}.pdf`;
    await supabaseStorage.upload(ASSIGNMENT_RESOURCE_BUCKET, path, new TextEncoder().encode("%PDF-1.4 brief"), PDF);
    stored.push(path);
    return { path, name, size: 14, type: PDF };
  }

  const base = (courseId: string, over: Record<string, unknown> = {}) => ({
    courseId,
    title: "Research Paper",
    instructions: "<p>Write <u>2,000</u> words.</p><script>alert(1)</script>",
    dueAt: "",
    maxPoints: 100,
    fileTypes: ["pdf", "doc", "docx"],
    resources: [],
    ...over,
  });

  beforeAll(async () => {
    owner = await user("own", "instructor");
    rival = await user("riv", "instructor");
    learner = await user("lrn", "learner");
    outsider = await user("out", "learner");
    live = await createCourse(svc, owner.id, { slug: `${tag}-live`, title: `${tag} Live`, publish: true });
    liveWithDraft = await createCourse(svc, owner.id, { slug: `${tag}-lwd`, title: `${tag} LiveDraft`, publish: true });
    unpublished = await createCourse(svc, owner.id, { slug: `${tag}-draft`, title: `${tag} Draft`, publish: false });
    inReview = await createCourse(svc, owner.id, { slug: `${tag}-rev`, title: `${tag} Review`, publish: false });
    courseIds.push(live.courseId, liveWithDraft.courseId, unpublished.courseId, inReview.courseId);
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", inReview.versionId);
    const v2 = await svc
      .from("course_versions")
      .insert({ course_id: liveWithDraft.courseId, version_number: 2, title: `${tag} LiveDraft`, status: "draft" })
      .select("id")
      .single();
    draftV2 = v2.data!.id as string;
    await svc.from("enrollments").insert([
      { user_id: learner.id, course_id: live.courseId, version_id: live.versionId },
      { user_id: learner.id, course_id: liveWithDraft.courseId, version_id: liveWithDraft.versionId },
    ]);
  }, 200_000);

  afterAll(async () => {
    if (stored.length) await supabaseStorage.remove(ASSIGNMENT_RESOURCE_BUCKET, stored).catch(() => undefined);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("lists the instructor's courses with whether an assignment can be added now", async () => {
    const courses = await getAssignableCourses(owner.client, owner.id);
    const byId = new Map(courses.map((c) => [c.id, c.state]));
    expect(byId.get(live.courseId)).toBe("live");
    expect(byId.get(liveWithDraft.courseId)).toBe("live");
    expect(byId.get(unpublished.courseId)).toBe("draft");
    expect(byId.get(inReview.courseId)).toBe("locked");
    expect((await getAssignableCourses(rival.client, rival.id)).find((c) => c.id === live.courseId)).toBeUndefined();
  });

  it("adds an assignment to a live course: enrolled learners see it at once, with sanitized rich text, types and files", async () => {
    currentClient = owner.client;
    const file = await putResource(owner.id);
    const r = await createCourseAssignment(base(live.courseId, { resources: [file], dueAt: "2031-05-01T17:00" }));
    expect(r).toMatchObject({ ok: true, live: true });
    if (!r.ok) return;
    const { data: row } = await svc.from("assignments").select("*").eq("id", r.id).single();
    expect(row).toMatchObject({ version_id: live.versionId, title: "Research Paper", max_points: 100, allow_file: true, due_at: "2031-05-01T17:00:00+00:00" });
    expect(row!.allowed_file_types).toEqual(["pdf", "doc", "docx"]);
    expect(row!.instructions).toContain("<u>2,000</u>");
    expect(row!.instructions).not.toContain("script");

    const mine = (await getMyAssignments(learner.client, learner.id)).find((a) => a.id === r.id);
    expect(mine).toMatchObject({ title: "Research Paper", allowedFileTypes: ["pdf", "doc", "docx"], status: "open" });
    expect((await getAssignmentResources(learner.client, r.id)).map((f) => f.name)).toEqual(["brief.pdf"]);
    // Not enrolled: no rows.
    expect(await getAssignmentResources(outsider.client, r.id)).toEqual([]);
  });

  it("without a due date, the assignment has no deadline", async () => {
    currentClient = owner.client;
    const r = await createCourseAssignment(base(live.courseId, { title: "Reflection" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect((await svc.from("assignments").select("due_at").eq("id", r.id).single()).data!.due_at).toBeNull();
  });

  it("goes into both the live version and the newest editable draft, so the next publish keeps it", async () => {
    currentClient = owner.client;
    const r = await createCourseAssignment(base(liveWithDraft.courseId, { title: "Both versions" }));
    expect(r.ok).toBe(true);
    const { data } = await svc.from("assignments").select("version_id").eq("title", "Both versions").in("version_id", [liveWithDraft.versionId, draftV2]);
    expect(new Set((data ?? []).map((a) => a.version_id))).toEqual(new Set([liveWithDraft.versionId, draftV2]));
  });

  it("an unpublished draft course gets it in the draft; a course only in review is refused", async () => {
    currentClient = owner.client;
    const d = await createCourseAssignment(base(unpublished.courseId, { title: "Draft one" }));
    expect(d).toMatchObject({ ok: true, live: false });
    const locked = await createCourseAssignment(base(inReview.courseId));
    expect(locked).toMatchObject({ ok: false, error: expect.stringContaining("in review") });
  });

  it("refuses another instructor's course and reference files outside the caller's prefix", async () => {
    currentClient = rival.client;
    expect(await createCourseAssignment(base(live.courseId))).toMatchObject({ ok: false, error: "This course is not available." });
    currentClient = owner.client;
    const theirs = await putResource(rival.id);
    expect(await createCourseAssignment(base(live.courseId, { resources: [theirs] }))).toEqual({ ok: false, error: "That upload does not belong to you." });
    const ghost = { path: `${owner.id}/never.pdf`, name: "never.pdf", size: 5, type: PDF };
    expect(await createCourseAssignment(base(live.courseId, { resources: [ghost] }))).toMatchObject({ ok: false });
    // The database refuses it too, even when called directly.
    const direct = await owner.client.rpc("create_course_assignment", {
      p_course_id: live.courseId, p_title: "x", p_instructions: "<p>x</p>", p_due_at: null, p_max_points: 10,
      p_allowed_file_types: ["pdf"], p_resources: [{ name: "t.pdf", storage_path: theirs.path, mime_type: PDF, size_bytes: 14 }],
    });
    expect(direct.error).not.toBeNull();
    const rivalDirect = await rival.client.rpc("create_course_assignment", {
      p_course_id: live.courseId, p_title: "x", p_instructions: "", p_due_at: null, p_max_points: 10, p_allowed_file_types: ["pdf"], p_resources: [],
    });
    expect(rivalDirect.error).not.toBeNull();
  });

  it("validates the form server-side", async () => {
    currentClient = owner.client;
    const r = await createCourseAssignment(base(live.courseId, { title: "", instructions: "<p> </p>", fileTypes: [], maxPoints: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["fileTypes", "instructions", "maxPoints", "title"]);
  });

  it("RLS: a reference-file row must point at the inserter's own objects, and live rows are not editable", async () => {
    const { data: a } = await svc.from("assignments").select("id").eq("version_id", unpublished.versionId).limit(1).single();
    const theirs = await putResource(rival.id);
    const bad = await owner.client.from("assignment_resources").insert({ assignment_id: a!.id, name: "t.pdf", storage_path: theirs.path, mime_type: PDF, size_bytes: 14 });
    expect(bad.error).not.toBeNull();
    const mine = await putResource(owner.id);
    const ok = await owner.client.from("assignment_resources").insert({ assignment_id: a!.id, name: "m.pdf", storage_path: mine.path, mime_type: PDF, size_bytes: 14 });
    expect(ok.error).toBeNull();
    const { data: liveA } = await svc.from("assignments").select("id").eq("version_id", live.versionId).limit(1).single();
    const onLive = await owner.client.from("assignment_resources").insert({ assignment_id: liveA!.id, name: "m.pdf", storage_path: mine.path, mime_type: PDF, size_bytes: 14 });
    expect(onLive.error).not.toBeNull();
  });

  it("the database enforces the allowed file types on submission", async () => {
    const { data: a } = await svc.from("assignments").select("id").eq("version_id", live.versionId).eq("title", "Reflection").single();
    const zip = await svc.rpc("submit_assignment", {
      p_assignment_id: a!.id, p_user_id: learner.id, p_text: "", p_file_path: `${a!.id}/${learner.id}/x.zip`, p_file_name: "x.zip", p_file_size: 10, p_file_type: "application/zip",
    });
    expect(zip.data).toEqual({ result: "file_type_not_allowed" });
    const pdf = await svc.rpc("submit_assignment", {
      p_assignment_id: a!.id, p_user_id: learner.id, p_text: "", p_file_path: `${a!.id}/${learner.id}/x.pdf`, p_file_name: "x.pdf", p_file_size: 10, p_file_type: PDF,
    });
    expect(pdf.data).toMatchObject({ result: "ok" });
  });

  it("the overview lists every assignment once, with submissions over enrolled, scoped to the owner", async () => {
    const rows = await getAssignmentOverview(owner.client);
    const reflection = rows.find((r) => r.title === "Reflection");
    expect(reflection).toMatchObject({ courseId: live.courseId, isLive: true, versionStatus: "published", submissions: 1, ungraded: 1, enrolled: 1 });
    // The live copy only, not the draft copy too.
    expect(rows.filter((r) => r.title === "Both versions")).toHaveLength(1);
    expect(rows.find((r) => r.title === "Draft one")).toMatchObject({ versionStatus: "draft", isLive: false, enrolled: 0 });
    expect((await getAssignmentOverview(rival.client)).some((r) => r.courseId === live.courseId)).toBe(false);
  });

  it("new draft versions copy allowed types and reference files", async () => {
    const { data: newDraft, error } = await owner.client.rpc("create_draft_version", { p_course_id: live.courseId });
    expect(error).toBeNull();
    const { data: copy } = await svc.from("assignments").select("id, allowed_file_types").eq("version_id", newDraft as string).eq("title", "Research Paper").single();
    expect(copy!.allowed_file_types).toEqual(["pdf", "doc", "docx"]);
    expect((await getAssignmentResources(owner.client, copy!.id as string)).map((f) => f.name)).toEqual(["brief.pdf"]);

    // Deleting the draft copy keeps the object the live version still uses.
    currentClient = owner.client;
    const shared = (await getAssignmentResources(owner.client, copy!.id as string))[0].storagePath;
    expect(await deleteAssignment(live.courseId, copy!.id as string)).toEqual({ ok: true });
    expect(await supabaseStorage.exists(ASSIGNMENT_RESOURCE_BUCKET, shared)).toBe(true);
  });

  it("issues upload tickets only to instructors, under their prefix, and discards only unused uploads", async () => {
    currentClient = learner.client;
    expect(await requestAssignmentResourceUpload({ name: "a.pdf", size: 10, type: PDF })).toMatchObject({ ok: false });
    currentClient = owner.client;
    expect(await requestAssignmentResourceUpload({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatchObject({ ok: false });
    const t = await requestAssignmentResourceUpload({ name: "a.pdf", size: 10, type: PDF });
    expect(t.ok && t.path.startsWith(`${owner.id}/`)).toBe(true);
    const unused = await putResource(owner.id);
    expect(await discardAssignmentResourceUpload(unused.path)).toEqual({ ok: true });
    expect(await supabaseStorage.exists(ASSIGNMENT_RESOURCE_BUCKET, unused.path)).toBe(false);
    const { data: used } = await svc.from("assignment_resources").select("storage_path").eq("name", "brief.pdf").limit(1).single();
    await discardAssignmentResourceUpload(used!.storage_path as string);
    expect(await supabaseStorage.exists(ASSIGNMENT_RESOURCE_BUCKET, used!.storage_path as string)).toBe(true);
    const theirs = await putResource(rival.id);
    expect(await discardAssignmentResourceUpload(theirs.path)).toEqual({ ok: false });
  });
});

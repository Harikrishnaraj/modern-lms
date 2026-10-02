import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasLiveProject)("instructor reviews (T-109, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("inrev");

  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let teacher1: { id: string; email: string; password: string };
  let teacher2: { id: string; email: string; password: string };
  let student1: { id: string; email: string; password: string };
  let student2: { id: string; email: string; password: string };

  let courseA: Awaited<ReturnType<typeof createCourse>>;
  let rating1Id: string;
  let rating2Id: string;

  let teacher1Client: SupabaseClient;
  let teacher2Client: SupabaseClient;
  let anonClient: SupabaseClient;

  beforeAll(async () => {
    // 1. Create fixtures
    teacher1 = await createUserWithRole(svc, `${tag}-tch1`, "instructor", {
      fullName: `${tag} Teacher One`,
    });
    teacher2 = await createUserWithRole(svc, `${tag}-tch2`, "instructor", {
      fullName: `${tag} Teacher Two`,
    });
    student1 = await createUserWithRole(svc, `${tag}-s1`, "learner", {
      fullName: `${tag} Alice`,
    });
    student2 = await createUserWithRole(svc, `${tag}-s2`, "learner", {
      fullName: `${tag} Bob`,
    });
    userIds.push(teacher1.id, teacher2.id);
    learnerIds.push(student1.id, student2.id);

    // 2. Create and publish course for teacher1
    courseA = await createCourse(svc, teacher1.id, {
      slug: `${tag}-course-a`,
      title: `${tag} Modern Cloud Architecture`,
      publish: true,
    });
    courseIds.push(courseA.courseId);

    // 3. Complete enrollments for student1 and student2
    await svc.from("enrollments").insert([
      {
        user_id: student1.id,
        course_id: courseA.courseId,
        version_id: courseA.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
      {
        user_id: student2.id,
        course_id: courseA.courseId,
        version_id: courseA.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
    ]);

    // 4. Insert ratings for student1 (5 stars) and student2 (4 stars)
    const { data: r1, error: err1 } = await svc
      .from("course_ratings")
      .insert({
        course_id: courseA.courseId,
        user_id: student1.id,
        rating: 5,
        body: `${tag} Phenomenal course, learned heaps!`,
      })
      .select("id")
      .single();
    if (err1) throw err1;
    rating1Id = r1!.id;

    const { data: r2, error: err2 } = await svc
      .from("course_ratings")
      .insert({
        course_id: courseA.courseId,
        user_id: student2.id,
        rating: 4,
        body: `${tag} Very clear explanations and solid examples.`,
      })
      .select("id")
      .single();
    if (err2) throw err2;
    rating2Id = r2!.id;

    // 5. Initialize Supabase clients
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    teacher1Client = createClient(url, anonKey, { auth: { persistSession: false } });
    await teacher1Client.auth.signInWithPassword({
      email: teacher1.email,
      password: teacher1.password,
    });

    teacher2Client = createClient(url, anonKey, { auth: { persistSession: false } });
    await teacher2Client.auth.signInWithPassword({
      email: teacher2.email,
      password: teacher2.password,
    });

    anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  it("lists reviews scoped to the authenticated instructor's courses", async () => {
    const { data, error } = await teacher1Client.rpc("instructor_reviews");
    expect(error).toBeNull();
    expect(data).toBeDefined();

    const reviews = data as Array<{
      id: string;
      course_id: string;
      rating: number;
      body: string;
      learner_name: string;
      course_title: string;
    }>;

    const myReviews = reviews.filter((r) => r.course_id === courseA.courseId);
    expect(myReviews.length).toBe(2);

    const r1 = myReviews.find((r) => r.id === rating1Id);
    expect(r1).toBeDefined();
    expect(r1!.rating).toBe(5);
    expect(r1!.learner_name).toBe(`${tag} Alice`);
    expect(r1!.course_title).toContain(`${tag} Modern Cloud Architecture`);

    const r2 = myReviews.find((r) => r.id === rating2Id);
    expect(r2).toBeDefined();
    expect(r2!.rating).toBe(4);
    expect(r2!.learner_name).toBe(`${tag} Bob`);
  });

  it("calculates review summary and rating distribution", async () => {
    const { data, error } = await teacher1Client.rpc("instructor_review_summary", {
      p_course_id: courseA.courseId,
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();

    const summary = data as {
      total_reviews: number;
      average_rating: number;
      replied_count: number;
      unreplied_count: number;
      distribution: Record<string, number>;
    };

    expect(summary.total_reviews).toBe(2);
    expect(summary.average_rating).toBe(4.5);
    expect(summary.replied_count).toBe(0);
    expect(summary.unreplied_count).toBe(2);
    expect(summary.distribution["5"]).toBe(1);
    expect(summary.distribution["4"]).toBe(1);
    expect(summary.distribution["3"]).toBe(0);
  });

  it("allows the course instructor to post, update, and delete a reply", async () => {
    // 1. Post reply
    const { error: postErr } = await teacher1Client.rpc("reply_to_course_review", {
      p_rating_id: rating1Id,
      p_reply: "Thanks Alice! Glad you enjoyed the course.",
    });
    expect(postErr).toBeNull();

    // Verify reply saved
    const { data: revsAfterPost } = await teacher1Client.rpc("instructor_reviews", {
      p_course_id: courseA.courseId,
    });
    const updatedR1 = (revsAfterPost as Array<{ id: string; instructor_reply: string; replied_at: string }>).find(
      (r) => r.id === rating1Id,
    );
    expect(updatedR1?.instructor_reply).toBe("Thanks Alice! Glad you enjoyed the course.");
    expect(updatedR1?.replied_at).toBeDefined();

    // Verify summary reflects replied count
    const { data: summaryAfterPost } = await teacher1Client.rpc("instructor_review_summary", {
      p_course_id: courseA.courseId,
    });
    expect((summaryAfterPost as { replied_count: number }).replied_count).toBe(1);

    // 2. Update reply
    const { error: updateErr } = await teacher1Client.rpc("reply_to_course_review", {
      p_rating_id: rating1Id,
      p_reply: "Updated: Thanks Alice, best of luck with your projects!",
    });
    expect(updateErr).toBeNull();

    const { data: revsAfterUpdate } = await teacher1Client.rpc("instructor_reviews", {
      p_course_id: courseA.courseId,
    });
    const r1Updated = (revsAfterUpdate as Array<{ id: string; instructor_reply: string }>).find(
      (r) => r.id === rating1Id,
    );
    expect(r1Updated?.instructor_reply).toBe("Updated: Thanks Alice, best of luck with your projects!");

    // 3. Delete reply
    const { error: delErr } = await teacher1Client.rpc("delete_course_review_reply", {
      p_rating_id: rating1Id,
    });
    expect(delErr).toBeNull();

    const { data: revsAfterDel } = await teacher1Client.rpc("instructor_reviews", {
      p_course_id: courseA.courseId,
    });
    const r1Deleted = (revsAfterDel as Array<{ id: string; instructor_reply: string | null }>).find(
      (r) => r.id === rating1Id,
    );
    expect(r1Deleted?.instructor_reply).toBeNull();
  });

  it("prevents another instructor from viewing or replying to reviews on courses they do not own", async () => {
    // Teacher 2 lists reviews: should not see Course A's reviews
    const { data: t2Reviews } = await teacher2Client.rpc("instructor_reviews", {
      p_course_id: courseA.courseId,
    });
    expect((t2Reviews as Array<unknown>)?.length).toBe(0);

    // Teacher 2 attempts to reply: should be rejected
    const { error: replyErr } = await teacher2Client.rpc("reply_to_course_review", {
      p_rating_id: rating1Id,
      p_reply: "Unauthorized reply attempt",
    });
    expect(replyErr).not.toBeNull();
    expect(replyErr?.message).toContain("not allowed");
  });

  it("rejects unauthenticated and invalid requests", async () => {
    // Anon review listing rejected
    const { error: anonListErr } = await anonClient.rpc("instructor_reviews");
    expect(anonListErr).not.toBeNull();

    // Anon reply rejected
    const { error: anonReplyErr } = await anonClient.rpc("reply_to_course_review", {
      p_rating_id: rating1Id,
      p_reply: "Anon attempt",
    });
    expect(anonReplyErr).not.toBeNull();

    // Reply exceeding 2000 chars rejected
    const longReply = "x".repeat(2001);
    const { error: longErr } = await teacher1Client.rpc("reply_to_course_review", {
      p_rating_id: rating1Id,
      p_reply: longReply,
    });
    expect(longErr).not.toBeNull();
    expect(longErr?.message).toContain("2000");
  });
});

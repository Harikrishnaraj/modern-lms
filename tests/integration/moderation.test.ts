import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { reportContent, startDiscussion } from "@/features/discussions/actions";
import { reportReviewAction } from "@/features/reviews/actions";
import { getModerationQueue } from "@/features/admin/moderation";
import { dismissReportAction, moderateContentAction } from "@/features/admin/moderation-actions";
import { setUserStatus } from "@/features/admin/user-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-411: Moderation (T-139), live Supabase.
describe.skipIf(!hasLiveProject)("moderation queue (T-139, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("mod");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let author: { id: string; client: SupabaseClient };
  let reporter: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let threadId: string;
  let postId: string;
  let reviewId: string;

  async function user(name: string, role: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, fullName ? { fullName } : undefined);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    author = await user("author", "learner", `${tag} Author`);
    reporter = await user("rep", "learner", `${tag} Reporter`);

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    await svc.from("enrollments").insert([author.id, reporter.id].map((user_id) => ({ user_id, course_id: course.courseId, version_id: course.versionId, status: "active" })));

    currentClient = author.client;
    const thread = await startDiscussion(course.courseId, { title: `${tag} thread`, body: "Some offensive content." });
    if (!thread.ok) throw new Error(thread.error);
    threadId = thread.id;

    const { data: post } = await svc
      .from("discussion_posts")
      .insert({ discussion_id: threadId, author_id: author.id, body: "An offensive reply." })
      .select("id")
      .single();
    postId = post!.id;

    const { data: rating } = await svc
      .from("course_ratings")
      .insert({ course_id: course.courseId, user_id: author.id, rating: 1, body: "An offensive review." })
      .select("id")
      .single();
    reviewId = rating!.id;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("reports the thread, the post and the review", async () => {
    currentClient = reporter.client;
    expect(await reportContent("thread", threadId, "This is abusive", threadId)).toEqual({ ok: true });
    expect(await reportContent("post", postId, "This is abusive too", threadId)).toEqual({ ok: true });
    expect(await reportReviewAction(reviewId, "This review is fake")).toEqual({ ok: true });
  });

  it("rejects reporting your own review", async () => {
    currentClient = author.client;
    const res = await reportReviewAction(reviewId, "self report");
    expect(res).toEqual({ ok: false, error: "You cannot report your own review." });
  });

  it("lists all three open reports for an admin, and rejects a non-admin", async () => {
    const { reports, total } = await getModerationQueue(admin.client, "open", 1);
    expect(total).toBeGreaterThanOrEqual(3);
    const kinds = reports.filter((r) => [threadId, postId, reviewId].includes(r.targetId)).map((r) => r.reportKind);
    expect(kinds.sort()).toEqual(["post", "review", "thread"]);
    const threadReport = reports.find((r) => r.targetId === threadId)!;
    expect(threadReport).toMatchObject({ authorId: author.id, courseId: course.courseId, targetHidden: false, status: "open" });

    await expect(getModerationQueue(reporter.client, "open", 1)).rejects.toThrow();
  });

  it("rejects moderation writes from a non-admin", async () => {
    const { reports } = await getModerationQueue(admin.client, "open", 1);
    const threadReport = reports.find((r) => r.targetId === threadId)!;

    currentClient = reporter.client;
    expect((await moderateContentAction(threadReport.reportId, "thread", threadId, true)).ok).toBe(false);
    expect((await dismissReportAction(threadReport.reportId, "thread")).ok).toBe(false);
  });

  it("hides the reported thread and resolves its report", async () => {
    const { reports } = await getModerationQueue(admin.client, "open", 1);
    const threadReport = reports.find((r) => r.targetId === threadId)!;

    currentClient = admin.client;
    const res = await moderateContentAction(threadReport.reportId, "thread", threadId, true);
    expect(res).toEqual({ ok: true });

    const { data: discussion } = await svc.from("discussions").select("hidden").eq("id", threadId).single();
    expect(discussion!.hidden).toBe(true);

    const { data: report } = await svc.from("discussion_reports").select("status").eq("id", threadReport.reportId).single();
    expect(report!.status).toBe("resolved");

    const { data: auditRow } = await svc
      .from("audit_logs")
      .select("action, resource_id")
      .eq("action", "moderation.content_hidden")
      .eq("resource_id", threadId)
      .maybeSingle();
    expect(auditRow).toMatchObject({ action: "moderation.content_hidden" });
  });

  it("dismisses the review report without hiding the review", async () => {
    const { reports } = await getModerationQueue(admin.client, "open", 1);
    const reviewReport = reports.find((r) => r.targetId === reviewId)!;

    currentClient = admin.client;
    const res = await dismissReportAction(reviewReport.reportId, "review");
    expect(res).toEqual({ ok: true });

    const { data: report } = await svc.from("review_reports").select("status").eq("id", reviewReport.reportId).single();
    expect(report!.status).toBe("resolved");

    const { data: rating } = await svc.from("course_ratings").select("hidden").eq("id", reviewId).single();
    expect(rating!.hidden).toBe(false);
  });

  it("bans the offending author via the existing suspend mechanism", async () => {
    currentClient = admin.client;
    const res = await setUserStatus(author.id, "suspended");
    expect(res).toEqual({ ok: true });
    const { data: profile } = await svc.from("profiles").select("status").eq("id", author.id).single();
    expect(profile!.status).toBe("suspended");
  });
});

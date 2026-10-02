import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { rateLimit } from "@/services/rate-limit";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requestSubmissionUpload, submitAssignment } from "@/features/assignments/actions";
import { getMyAssignment, getMyAssignments } from "@/features/assignments/queries";
import { SUBMISSION_BUCKET, supabaseStorage } from "@/services/storage";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const past = () => new Date(Date.now() - 3_600_000).toISOString();
const future = () => new Date(Date.now() + 86_400_000).toISOString();

// F-108 / TEST_PLAN section 8: learner assignments, validated uploads, deadline and grading lock.
describe.skipIf(!hasLiveProject)("assignments (T-081, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("as");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const uploaded: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let learner: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let owner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let open: { assignmentId: string };
  let closed: { assignmentId: string };
  let lateOk: { assignmentId: string };
  let textOnly: { assignmentId: string };
  let elsewhere: { assignmentId: string };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    learner = await user("lrn", "learner");
    outsider = await user("out", "learner");
    owner = await user("own", "instructor");
    course = await createCourse(svc, owner.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    const other = await createCourse(svc, owner.id, { slug: `${tag}-o`, title: `${tag} Other`, publish: true });
    courseIds.push(course.courseId, other.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });
    open = await createAssignment(svc, course.versionId, { title: "Essay", dueAt: future(), maxFileMb: 1 });
    closed = await createAssignment(svc, course.versionId, { title: "Past due", dueAt: past() });
    lateOk = await createAssignment(svc, course.versionId, { title: "Late ok", dueAt: past(), allowLate: true });
    textOnly = await createAssignment(svc, course.versionId, { title: "Text only", allowFile: false });
    elsewhere = await createAssignment(svc, other.versionId, { title: "Not mine" });
  }, 200_000);

  afterAll(async () => {
    if (uploaded.length) await supabaseStorage.remove(SUBMISSION_BUCKET, uploaded).catch(() => undefined);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  const subs = async (assignmentId: string) =>
    (await svc.from("assignment_submissions").select("*").eq("assignment_id", assignmentId)).data ?? [];

  async function putFile(assignmentId: string, userId: string, name = "work.txt", body = "hello", type = "text/plain") {
    const ticket = await requestSubmissionUpload(assignmentId, { name, size: body.length, type });
    expect(ticket.ok).toBe(true);
    if (!ticket.ok) throw new Error(ticket.error);
    expect(ticket.path.startsWith(`${assignmentId}/${userId}/`)).toBe(true);
    const { error } = await svc.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, Buffer.from(body), { contentType: type });
    expect(error).toBeNull();
    uploaded.push(ticket.path);
    return { path: ticket.path, name, size: body.length, type };
  }

  it("lists only assignments of the exact version the learner is enrolled in, soonest deadline first", async () => {
    const list = await getMyAssignments(learner.client, learner.id);
    const mine = list.filter((a) => a.courseTitle === `${tag} Course`);
    expect(mine.map((a) => a.title)).toEqual(["Past due", "Late ok", "Essay", "Text only"]);
    expect(list.find((a) => a.id === elsewhere.assignmentId)).toBeUndefined();
    expect(mine.find((a) => a.title === "Past due")!.status).toBe("overdue");
    expect(mine.find((a) => a.title === "Essay")!.status).toBe("open");
    expect(await getMyAssignments(outsider.client, outsider.id)).toEqual([]);
    expect(await getMyAssignment(outsider.client, outsider.id, open.assignmentId)).toBeNull();
    expect(await getMyAssignment(learner.client, learner.id, "not-a-uuid")).toBeNull();
  });

  it("submits a written answer, then replaces it before the deadline", async () => {
    currentClient = learner.client;
    expect(await submitAssignment(open.assignmentId, { text: "  First draft  ", file: null })).toEqual({ ok: true });
    let rows = await subs(open.assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text_answer: "First draft", status: "submitted", is_late: false, user_id: learner.id });
    expect(await submitAssignment(open.assignmentId, { text: "Second draft", file: null })).toEqual({ ok: true });
    rows = await subs(open.assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].text_answer).toBe("Second draft");
    expect((await getMyAssignment(learner.client, learner.id, open.assignmentId))!.status).toBe("submitted");
  });

  it("validates input: empty, wrong types, oversized, disabled modes", async () => {
    currentClient = learner.client;
    expect(await submitAssignment(textOnly.assignmentId, { text: "   ", file: null })).toEqual({ ok: false, error: "Add a written answer or attach a file." });
    expect(await requestSubmissionUpload(open.assignmentId, { name: "run.exe", size: 10, type: "application/x-msdownload" })).toMatchObject({ ok: false });
    expect(await requestSubmissionUpload(open.assignmentId, { name: "big.pdf", size: 2 * 1024 * 1024, type: "application/pdf" })).toEqual({ ok: false, error: "The file must be 1 MB or smaller." });
    expect(await requestSubmissionUpload(textOnly.assignmentId, { name: "a.pdf", size: 10, type: "application/pdf" })).toEqual({ ok: false, error: "This assignment does not accept files." });
    expect(await submitAssignment(open.assignmentId, { text: "x".repeat(20001), file: null })).toMatchObject({ ok: false });
  });

  it("rejects requesting an upload ticket while rate-limited (T-241, SECURITY §18)", async () => {
    currentClient = learner.client;
    vi.mocked(rateLimit).mockResolvedValueOnce(false);
    expect(await requestSubmissionUpload(open.assignmentId, { name: "a.txt", size: 5, type: "text/plain" })).toEqual({
      ok: false,
      error: "Too many attempts. Please wait a while and try again.",
    });
  });

  it("uploads a file directly to storage, records it, and removes the replaced file", async () => {
    currentClient = learner.client;
    const first = await putFile(open.assignmentId, learner.id, "one.txt", "first file");
    expect(await submitAssignment(open.assignmentId, { text: "", file: first })).toEqual({ ok: true });
    let row = (await subs(open.assignmentId))[0];
    expect(row).toMatchObject({ file_path: first.path, file_name: "one.txt", file_type: "text/plain" });
    expect(await supabaseStorage.exists(SUBMISSION_BUCKET, first.path)).toBe(true);
    // The learner can read their own file through a signed URL made by the server.
    const url = await supabaseStorage.createSignedUrl(SUBMISSION_BUCKET, first.path, 60);
    expect(await (await fetch(url)).text()).toBe("first file");

    const second = await putFile(open.assignmentId, learner.id, "two.txt", "second file");
    expect(await submitAssignment(open.assignmentId, { text: "", file: second })).toEqual({ ok: true });
    row = (await subs(open.assignmentId))[0];
    expect(row.file_path).toBe(second.path);
    expect(await supabaseStorage.exists(SUBMISSION_BUCKET, first.path)).toBe(false);
  });

  it("refuses a file path that is not the learner's own or was never uploaded", async () => {
    currentClient = learner.client;
    const bad = { path: `${open.assignmentId}/${outsider.id}/x.txt`, name: "x.txt", size: 5, type: "text/plain" };
    expect(await submitAssignment(open.assignmentId, { text: "", file: bad })).toEqual({ ok: false, error: "That upload does not belong to you." });
    const traversal = { path: `${open.assignmentId}/${learner.id}/../${outsider.id}/x.txt`, name: "x.txt", size: 5, type: "text/plain" };
    expect(await submitAssignment(open.assignmentId, { text: "", file: traversal })).toEqual({ ok: false, error: "That upload does not belong to you." });
    const ghost = { path: `${open.assignmentId}/${learner.id}/never-uploaded.txt`, name: "g.txt", size: 5, type: "text/plain" };
    expect(await submitAssignment(open.assignmentId, { text: "", file: ghost })).toEqual({ ok: false, error: "The upload did not complete. Please try again." });
  });

  it("locks after the deadline: no submission unless late work is allowed (then it is flagged late)", async () => {
    currentClient = learner.client;
    expect(await submitAssignment(closed.assignmentId, { text: "too late", file: null })).toEqual({ ok: false, error: "The deadline has passed and late submissions are not accepted." });
    expect(await subs(closed.assignmentId)).toEqual([]);
    expect(await requestSubmissionUpload(closed.assignmentId, { name: "a.txt", size: 5, type: "text/plain" })).toMatchObject({ ok: false });

    expect(await submitAssignment(lateOk.assignmentId, { text: "better late", file: null })).toEqual({ ok: true });
    expect((await subs(lateOk.assignmentId))[0]).toMatchObject({ is_late: true, text_answer: "better late" });
  });

  it("a submission becomes read-only once the deadline passes", async () => {
    currentClient = learner.client;
    const a = await createAssignment(svc, course.versionId, { title: "Soon due", dueAt: future() });
    expect(await submitAssignment(a.assignmentId, { text: "on time", file: null })).toEqual({ ok: true });
    await svc.from("assignments").update({ due_at: past() }).eq("id", a.assignmentId);
    expect(await submitAssignment(a.assignmentId, { text: "changed my mind", file: null })).toEqual({ ok: false, error: "The deadline has passed and late submissions are not accepted." });
    expect((await subs(a.assignmentId))[0].text_answer).toBe("on time");
    expect((await getMyAssignment(learner.client, learner.id, a.assignmentId))!.status).toBe("closed");
  });

  it("a graded submission is locked and shows grade and feedback", async () => {
    currentClient = learner.client;
    await svc.from("assignment_submissions").update({ status: "graded", grade: 88, feedback: "Nice work", graded_at: new Date().toISOString() }).eq("assignment_id", open.assignmentId);
    expect(await submitAssignment(open.assignmentId, { text: "edit after grading", file: null })).toEqual({ ok: false, error: "This submission has been graded and can no longer be changed." });
    const a = await getMyAssignment(learner.client, learner.id, open.assignmentId);
    expect(a).toMatchObject({ status: "graded", submission: { grade: 88, feedback: "Nice work" } });
  });

  it("refuses learners who are not enrolled, and unknown assignments", async () => {
    currentClient = outsider.client;
    expect(await submitAssignment(open.assignmentId, { text: "sneaky", file: null })).toEqual({ ok: false, error: "This assignment is not available." });
    expect(await submitAssignment("00000000-0000-4000-8000-000000000000", { text: "x", file: null })).toEqual({ ok: false, error: "This assignment is not available." });
    // Enrolled in a different version of the same course does not count either.
    const v2 = await svc.from("course_versions").insert({ course_id: course.courseId, version_number: 2, title: `${tag} v2`, status: "draft" }).select("id").single();
    const onV2 = await createAssignment(svc, v2.data!.id as string, { title: "v2 only" });
    currentClient = learner.client;
    expect(await submitAssignment(onV2.assignmentId, { text: "x", file: null })).toEqual({ ok: false, error: "This assignment is not available." });
  });

  it("RLS: learners read only their own submissions, the owner reads all, direct writes are refused", async () => {
    const own = await learner.client.from("assignment_submissions").select("id");
    expect((own.data ?? []).every((r) => r.id)).toBe(true);
    expect((own.data ?? []).length).toBeGreaterThan(0);
    expect((await outsider.client.from("assignment_submissions").select("id")).data).toEqual([]);
    expect(((await owner.client.from("assignment_submissions").select("user_id")).data ?? []).some((r) => r.user_id === learner.id)).toBe(true);

    const insert = await learner.client.from("assignment_submissions").insert({ assignment_id: closed.assignmentId, user_id: learner.id, text_answer: "direct" });
    expect(insert.error).not.toBeNull();
    const update = await learner.client.from("assignment_submissions").update({ grade: 100, status: "graded" }).eq("assignment_id", open.assignmentId).select("id");
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    expect((await subs(open.assignmentId))[0].grade).toBe(88);
    // The submit function is not callable by learners.
    const rpc = await learner.client.rpc("submit_assignment", { p_assignment_id: closed.assignmentId, p_user_id: learner.id, p_text: "x", p_file_path: null, p_file_name: null, p_file_size: null, p_file_type: null });
    expect(rpc.error).not.toBeNull();
  });
});

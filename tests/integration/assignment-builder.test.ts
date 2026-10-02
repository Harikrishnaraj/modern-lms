import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createAssignment as fixtureAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAssignment, deleteAssignment, saveAssignment } from "@/features/course-authoring/assignment-actions";
import { getAssignmentForEditing, listAssignments } from "@/features/course-authoring/assignment-authoring";
import { getGradingQueue, getSubmissionForGrading } from "@/features/assignments/grading";
import { gradeSubmission } from "@/features/assignments/grading-actions";
import { submitAssignment } from "@/features/assignments/actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-206: build assignments with a rubric, then grade them; ownership, locks and bounds enforced.
describe.skipIf(!hasLiveProject)("assignment builder and grading (T-100, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ab");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let owner: U, other: U, learner: U, learner2: U;
  let draft: Awaited<ReturnType<typeof createCourse>>;
  let locked: Awaited<ReturnType<typeof createCourse>>;
  let assignmentId: string;

  async function user(name: string, role: string, fullName?: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    if (fullName) await svc.from("profiles").update({ full_name: fullName }).eq("id", u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const as = (u: U) => {
    currentClient = u.client;
  };
  const settings = (over = {}) => ({
    title: "Report", instructions: "Write it", dueAt: "", maxPoints: 100, allowLate: false, allowText: true, allowFile: true, maxFileMb: 5, allowedFileTypes: ["pdf", "docx"],
    criteria: [{ title: "Content", description: "Depth", maxPoints: 60 }, { title: "Style", description: "", maxPoints: 40 }],
    ...over,
  });

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner", "Lena Learner");
    learner2 = await user("l2", "learner");
    draft = await createCourse(svc, owner.id, { slug: `${tag}-d`, title: `${tag} Draft`, publish: false });
    locked = await createCourse(svc, owner.id, { slug: `${tag}-l`, title: `${tag} Locked`, publish: false });
    courseIds.push(draft.courseId, locked.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", locked.versionId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("creates an assignment on the draft version with defaults", async () => {
    as(owner);
    expect(await createAssignment(draft.courseId, { title: " " })).toMatchObject({ ok: false });
    const r = await createAssignment(draft.courseId, { title: "  Essay   one " });
    expect(r.ok).toBe(true);
    assignmentId = (r as { id: string }).id;
    const a = await getAssignmentForEditing(owner.client, draft.versionId, assignmentId);
    expect(a).toMatchObject({ title: "Essay one", maxPoints: 100, allowText: true, allowFile: true, maxFileMb: 10, dueAt: "", criteria: [], submissions: 0 });
    expect((await listAssignments(owner.client, draft.versionId)).map((x) => x.title)).toEqual(["Essay one"]);
  });

  it("saves settings and a rubric that must add up, replacing the rubric atomically", async () => {
    as(owner);
    expect(await saveAssignment(draft.courseId, assignmentId, settings({ criteria: [{ title: "Only", description: "", maxPoints: 50 }] }))).toMatchObject({
      ok: false, fieldErrors: { criteria: expect.stringContaining("adds up to 50") },
    });
    expect(await saveAssignment(draft.courseId, assignmentId, settings({ dueAt: "2031-03-18T10:00", allowLate: true, title: "Report" }))).toEqual({ ok: true, id: assignmentId });
    let a = (await getAssignmentForEditing(owner.client, draft.versionId, assignmentId))!;
    expect(a).toMatchObject({ title: "Report", dueAt: "2031-03-18T10:00", allowLate: true, maxFileMb: 5 });
    expect(a.criteria.map((c) => [c.title, c.maxPoints])).toEqual([["Content", 60], ["Style", 40]]);

    expect(await saveAssignment(draft.courseId, assignmentId, settings({ criteria: [{ title: "Everything", description: "", maxPoints: 100 }] }))).toEqual({ ok: true, id: assignmentId });
    a = (await getAssignmentForEditing(owner.client, draft.versionId, assignmentId))!;
    expect(a.criteria).toEqual([{ title: "Everything", description: "", maxPoints: 100 }]);
    // Restore the two-criterion rubric for the grading tests.
    await saveAssignment(draft.courseId, assignmentId, settings());
  });

  it("refuses other instructors, locked courses, and foreign assignment ids", async () => {
    as(other);
    expect(await createAssignment(draft.courseId, { title: "Sneaky" })).toEqual({ ok: false, error: "This assignment is not available." });
    expect(await saveAssignment(draft.courseId, assignmentId, settings())).toEqual({ ok: false, error: "This assignment is not available." });
    expect(await deleteAssignment(draft.courseId, assignmentId)).toEqual({ ok: false, error: "This assignment is not available." });
    expect(await getAssignmentForEditing(other.client, draft.versionId, assignmentId)).toBeNull();

    as(owner);
    expect(await createAssignment(locked.courseId, { title: "Too late" })).toEqual({ ok: false, error: "This course is locked while it is in review or published." });
    const foreign = await fixtureAssignment(svc, locked.versionId, { title: "Foreign" });
    expect(await saveAssignment(draft.courseId, foreign.assignmentId, settings())).toEqual({ ok: false, error: "This assignment is not available." });
    expect(await getAssignmentForEditing(owner.client, draft.versionId, "not-a-uuid")).toBeNull();
  });

  it("the grading queue lists the owner submissions only, ungraded first", async () => {
    // Learners enrol in the draft version through the service role and submit work.
    await svc.from("enrollments").insert([
      { user_id: learner.id, course_id: draft.courseId, version_id: draft.versionId },
      { user_id: learner2.id, course_id: draft.courseId, version_id: draft.versionId },
    ]);
    as(learner);
    expect(await submitAssignment(assignmentId, { text: "Lena work", file: null })).toEqual({ ok: true });
    as(learner2);
    expect(await submitAssignment(assignmentId, { text: "Second work", file: null })).toEqual({ ok: true });

    const queue = await getGradingQueue(owner.client);
    const mine = queue.filter((r) => r.assignmentId === assignmentId);
    expect(mine.map((r) => [r.learnerName, r.status, r.maxPoints])).toEqual([["Lena Learner", "submitted", 100], ["A learner", "submitted", 100]]);
    expect(await getGradingQueue(other.client)).toEqual([]);
    expect(await getGradingQueue(learner.client)).toEqual([]);
  });

  it("grades with the rubric: sums, stores scores, notifies the learner, locks the learner out, allows a re-grade", async () => {
    const sub = (await svc.from("assignment_submissions").select("id").eq("user_id", learner.id).single()).data!.id as string;
    as(owner);
    const s = (await getSubmissionForGrading(owner.client, owner.id, sub))!;
    expect(s.criteria.map((c) => c.title)).toEqual(["Content", "Style"]);
    const [a, b] = s.criteria;

    expect(await gradeSubmission(sub, { scores: { [a.id]: 61, [b.id]: 10 }, grade: null, feedback: "" })).toMatchObject({ ok: false });
    expect(await gradeSubmission(sub, { scores: { [a.id]: 50 }, grade: null, feedback: "" })).toMatchObject({ ok: false });
    expect((await svc.from("assignment_submissions").select("status").eq("id", sub).single()).data!.status).toBe("submitted");

    expect(await gradeSubmission(sub, { scores: { [a.id]: 50, [b.id]: 30 }, grade: null, feedback: "  Good depth  " })).toEqual({ ok: true });
    const row = (await svc.from("assignment_submissions").select("status, grade, feedback, graded_by, rubric_scores").eq("id", sub).single()).data!;
    expect(row).toMatchObject({ status: "graded", grade: 80, feedback: "Good depth", graded_by: owner.id });
    expect((row.rubric_scores as { points: number }[]).map((r) => r.points)).toEqual([50, 30]);
    const notes = (await svc.from("notifications").select("category, title, body, href").eq("user_id", learner.id)).data!;
    expect(notes).toEqual([{ category: "assignment", title: "Your work on Report was graded", body: "80 / 100", href: `/learner/assignments/${assignmentId}` }]);

    // The learner cannot change graded work; the owner can re-grade.
    as(learner);
    expect(await submitAssignment(assignmentId, { text: "edit", file: null })).toEqual({ ok: false, error: "This submission has been graded and can no longer be changed." });
    as(owner);
    expect(await gradeSubmission(sub, { scores: { [a.id]: 60, [b.id]: 40 }, grade: null, feedback: "Perfect after all" })).toEqual({ ok: true });
    expect((await svc.from("assignment_submissions").select("grade").eq("id", sub).single()).data!.grade).toBe(100);
    const queue = await getGradingQueue(owner.client);
    expect(queue.filter((r) => r.assignmentId === assignmentId).map((r) => r.status)).toEqual(["submitted", "graded"]);
  });

  it("only the course owner can grade: other instructors, learners and direct RPC calls are refused", async () => {
    const sub = (await svc.from("assignment_submissions").select("id").eq("user_id", learner2.id).single()).data!.id as string;
    as(other);
    expect(await gradeSubmission(sub, { scores: {}, grade: 10, feedback: "" })).toEqual({ ok: false, error: "This submission is not available." });
    as(learner2);
    expect(await gradeSubmission(sub, { scores: {}, grade: 100, feedback: "self-grade" })).toEqual({ ok: false, error: "This submission is not available." });
    const rpc = await other.client.rpc("grade_assignment_submission", { p_submission_id: sub, p_grade: 10, p_feedback: "", p_scores: [] });
    expect(rpc.data).toEqual({ result: "not_found" });
    const overMax = await owner.client.rpc("grade_assignment_submission", { p_submission_id: sub, p_grade: 101, p_feedback: "", p_scores: [] });
    expect(overMax.data).toMatchObject({ result: "bad_grade", max_points: 100 });
    expect((await svc.from("assignment_submissions").select("status, grade").eq("id", sub).single()).data).toEqual({ status: "submitted", grade: null });
    expect(await getSubmissionForGrading(other.client, other.id, sub)).toBeNull();
    // A learner can read their own row but is not the course owner.
    expect(await getSubmissionForGrading(learner2.client, learner2.id, sub)).toBeNull();
    expect(await getSubmissionForGrading(owner.client, owner.id, "nope")).toBeNull();
  });

  it("an assignment with submissions cannot be deleted; one without can", async () => {
    as(owner);
    expect(await deleteAssignment(draft.courseId, assignmentId)).toEqual({ ok: false, error: "Learners have already submitted work, so this assignment cannot be deleted." });
    const fresh = (await createAssignment(draft.courseId, { title: "Disposable" })) as { id: string };
    expect(await deleteAssignment(draft.courseId, fresh.id)).toEqual({ ok: true });
    expect(await getAssignmentForEditing(owner.client, draft.versionId, fresh.id)).toBeNull();
  });

  it("without a rubric the grade is a plain number within the points", async () => {
    as(owner);
    const plain = (await createAssignment(draft.courseId, { title: "Plain" })) as { id: string };
    await saveAssignment(draft.courseId, plain.id, settings({ title: "Plain", maxPoints: 20, criteria: [] }));
    as(learner);
    await submitAssignment(plain.id, { text: "done", file: null });
    const sub = (await svc.from("assignment_submissions").select("id").eq("assignment_id", plain.id).single()).data!.id as string;
    as(owner);
    expect(await gradeSubmission(sub, { scores: {}, grade: 21, feedback: "" })).toEqual({ ok: false, error: "Enter a whole number of points from 0 to 20." });
    expect(await gradeSubmission(sub, { scores: {}, grade: 17, feedback: "" })).toEqual({ ok: true });
    expect((await svc.from("assignment_submissions").select("grade").eq("id", sub).single()).data!.grade).toBe(17);
  });
});

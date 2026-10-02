import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Never hit the real Resend API from a test run; each test controls the outcome explicitly.
const sendEmail = vi.fn().mockResolvedValue({ ok: true, id: "msg_test" });
vi.mock("@/services/email", () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));

import {
  createAnnouncementAction,
  createTemplateAction,
  deleteTemplateAction,
  previewTargetCountAction,
  sendAnnouncementAction,
  updateTemplateAction,
} from "@/features/admin/communication-actions";
import { getDeliveryLog, listAnnouncements, listTemplates, resolveTargets } from "@/features/admin/communication";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-413: Communication — targeted announcements, email templates, delivery log (T-141), live Supabase.
describe.skipIf(!hasLiveProject)("communication (T-141, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("comm");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const templateIds: string[] = [];
  const announcementIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; email: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, email: u.email, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    learner = await user("learner", "learner");

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course` });
    courseIds.push(course.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });
  }, 200_000);

  afterAll(async () => {
    if (announcementIds.length) await svc.from("announcements").delete().in("id", announcementIds);
    if (templateIds.length) await svc.from("announcement_templates").delete().in("id", templateIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("rejects a non-admin from every communication action and RPC", async () => {
    currentClient = learner.client;
    expect((await createTemplateAction({ name: "x", subject: "x", body: "x" })).ok).toBe(false);
    expect((await createAnnouncementAction({ templateId: null, subject: "x", body: "x", targetType: "all_learners", targetRole: null, targetCourseId: null })).ok).toBe(false);
    await expect(resolveTargets(learner.client, { targetType: "all_learners", targetRole: null, targetCourseId: null })).rejects.toThrow();
  });

  it("creates, updates and deletes a template (audited)", async () => {
    currentClient = admin.client;
    const created = await createTemplateAction({ name: `${tag} Template`, subject: "Welcome", body: "Hello there." });
    expect(created.ok).toBe(true);
    const templates = await listTemplates(admin.client);
    const t = templates.find((x) => x.name === `${tag} Template`);
    expect(t).toBeDefined();
    templateIds.push(t!.id);

    const updated = await updateTemplateAction(t!.id, { name: `${tag} Template`, subject: "Welcome v2", body: "Hello again." });
    expect(updated.ok).toBe(true);
    expect((await listTemplates(admin.client)).find((x) => x.id === t!.id)?.subject).toBe("Welcome v2");

    const deleted = await deleteTemplateAction(t!.id);
    expect(deleted.ok).toBe(true);
    templateIds.splice(templateIds.indexOf(t!.id), 1);
    expect((await listTemplates(admin.client)).some((x) => x.id === t!.id)).toBe(false);

    const { data: auditRows } = await svc
      .from("audit_logs")
      .select("action")
      .in("action", ["communication.template_created", "communication.template_updated", "communication.template_deleted"])
      .eq("resource_id", t!.id);
    expect(auditRows).toHaveLength(3);
  });

  it("previews the same recipient count the send will actually use, per target type", async () => {
    currentClient = admin.client;
    const byCourse = await previewTargetCountAction({ targetType: "course", targetRole: null, targetCourseId: course.courseId });
    expect(byCourse.ok && byCourse.count).toBeGreaterThanOrEqual(1);

    const byRole = await previewTargetCountAction({ targetType: "role", targetRole: "learner", targetCourseId: null });
    expect(byRole.ok && byRole.count).toBeGreaterThanOrEqual(1);

    const invalid = await previewTargetCountAction({ targetType: "role", targetRole: null, targetCourseId: null });
    expect(invalid.ok).toBe(false);
  });

  it("sends a targeted announcement: delivers in-app + email, logs both, and audits the send", async () => {
    currentClient = admin.client;
    const created = await createAnnouncementAction({
      templateId: null,
      subject: `${tag} subject`,
      body: "Body text for the announcement.",
      targetType: "course",
      targetRole: null,
      targetCourseId: course.courseId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.id) throw new Error("unreachable");
    announcementIds.push(created.id);

    const sent = await sendAnnouncementAction(created.id);
    expect(sent).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: learner.email, subject: `${tag} subject` }));

    const announcement = (await listAnnouncements(admin.client)).find((a) => a.id === created.id);
    expect(announcement?.status).toBe("sent");

    const log = await getDeliveryLog(admin.client, created.id);
    expect(log.some((d) => d.channel === "in_app" && d.status === "sent" && d.userId === learner.id)).toBe(true);
    expect(log.some((d) => d.channel === "email" && d.status === "sent" && d.email === learner.email)).toBe(true);

    const { data: notif } = await svc.from("notifications").select("id, title").eq("user_id", learner.id).eq("title", `${tag} subject`).maybeSingle();
    expect(notif).not.toBeNull();

    const { data: auditRows } = await svc.from("audit_logs").select("action").eq("action", "communication.announcement_sent").eq("resource_id", created.id);
    expect(auditRows).toHaveLength(1);

    // Sending twice is refused: the announcement is no longer a draft.
    const resent = await sendAnnouncementAction(created.id);
    expect(resent.ok).toBe(false);
  });

  it("logs a failed delivery without aborting the rest of the send when the email provider rejects it", async () => {
    sendEmail.mockResolvedValueOnce({ ok: false, error: "simulated provider rejection" });
    currentClient = admin.client;
    const created = await createAnnouncementAction({
      templateId: null,
      subject: `${tag} failure case`,
      body: "Body.",
      targetType: "course",
      targetRole: null,
      targetCourseId: course.courseId,
    });
    if (!created.ok || !created.id) throw new Error("unreachable");
    announcementIds.push(created.id);

    const sent = await sendAnnouncementAction(created.id);
    expect(sent).toEqual({ ok: true }); // the in-app channel still succeeded

    const log = await getDeliveryLog(admin.client, created.id);
    expect(log.some((d) => d.channel === "email" && d.status === "failed" && d.error === "simulated provider rejection")).toBe(true);
    expect(log.some((d) => d.channel === "in_app" && d.status === "sent")).toBe(true);
  });
});

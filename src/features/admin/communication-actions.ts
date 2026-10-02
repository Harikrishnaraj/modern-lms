"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/services/supabase/admin";
import { recordAudit } from "@/services/audit";
import { notify } from "@/services/notifications";
import { sendEmail } from "@/services/email";
import { announcementToEmailHtml, isTargetType, resolveTargets, type TargetSpec } from "./communication";

export type CommActionResult = { ok: true } | { ok: false; error: string };

function validateFields(subject: string, body: string): CommActionResult | null {
  if (subject.trim().length < 1 || subject.length > 200) return { ok: false, error: "Subject must be 1-200 characters." };
  if (body.trim().length < 1 || body.length > 5000) return { ok: false, error: "Body must be 1-5000 characters." };
  return null;
}

// ---- Templates -------------------------------------------------------------------------------

export async function createTemplateAction(input: { name: string; subject: string; body: string }): Promise<CommActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (input.name.trim().length < 1 || input.name.length > 150) return { ok: false, error: "Name must be 1-150 characters." };
  const fieldError = validateFields(input.subject, input.body);
  if (fieldError) return fieldError;

  const { data, error } = await supabase
    .from("announcement_templates")
    .insert({ name: input.name.trim(), subject: input.subject.trim(), body: input.body, created_by: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: "We could not create that template. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "communication.template_created",
    resourceType: "announcement_template",
    resourceId: data.id as string,
  });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function updateTemplateAction(
  templateId: string,
  input: { name: string; subject: string; body: string },
): Promise<CommActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (input.name.trim().length < 1 || input.name.length > 150) return { ok: false, error: "Name must be 1-150 characters." };
  const fieldError = validateFields(input.subject, input.body);
  if (fieldError) return fieldError;

  const { error } = await supabase
    .from("announcement_templates")
    .update({ name: input.name.trim(), subject: input.subject.trim(), body: input.body })
    .eq("id", templateId);
  if (error) return { ok: false, error: "We could not save that template. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "communication.template_updated",
    resourceType: "announcement_template",
    resourceId: templateId,
  });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function deleteTemplateAction(templateId: string): Promise<CommActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("announcement_templates").delete().eq("id", templateId);
  if (error) return { ok: false, error: "We could not delete that template. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "communication.template_deleted",
    resourceType: "announcement_template",
    resourceId: templateId,
  });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

// ---- Announcements ----------------------------------------------------------------------------

export interface AnnouncementInput {
  templateId: string | null;
  subject: string;
  body: string;
  targetType: string;
  targetRole: string | null;
  targetCourseId: string | null;
}

function targetSpec(input: AnnouncementInput): TargetSpec | { ok: false; error: string } {
  if (!isTargetType(input.targetType)) return { ok: false, error: "Invalid target." };
  if (input.targetType === "role" && !input.targetRole) return { ok: false, error: "Pick a role to target." };
  if (input.targetType === "course" && !input.targetCourseId) return { ok: false, error: "Pick a course to target." };
  return {
    targetType: input.targetType,
    targetRole: input.targetType === "role" ? input.targetRole : null,
    targetCourseId: input.targetType === "course" ? input.targetCourseId : null,
  };
}

/** Live recipient count for the compose form, before creating/sending anything. */
export async function previewTargetCountAction(input: {
  targetType: string;
  targetRole: string | null;
  targetCourseId: string | null;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const spec = targetSpec(input as AnnouncementInput);
  if ("ok" in spec) return spec;
  try {
    const recipients = await resolveTargets(supabase, spec);
    return { ok: true, count: recipients.length };
  } catch {
    return { ok: false, error: "Could not resolve the audience." };
  }
}

export async function createAnnouncementAction(input: AnnouncementInput): Promise<CommActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const fieldError = validateFields(input.subject, input.body);
  if (fieldError) return fieldError;
  const spec = targetSpec(input);
  if ("ok" in spec) return spec;

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      template_id: input.templateId,
      subject: input.subject.trim(),
      body: input.body,
      target_type: spec.targetType,
      target_role: spec.targetRole,
      target_course_id: spec.targetCourseId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "We could not save that draft. Please try again." };

  revalidatePath("/admin/notifications");
  return { ok: true, id: data.id as string };
}

/**
 * Resolves the audience, then sends each recipient an in-app notification and an email, logging
 * one announcement_deliveries row per recipient per channel. A per-recipient failure (e.g. Resend
 * rejects one address) does not abort the rest of the send.
 */
export async function sendAnnouncementAction(announcementId: string): Promise<CommActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data: row, error: fetchError } = await supabase.from("announcements").select("*").eq("id", announcementId).single();
  if (fetchError || !row) return { ok: false, error: "Announcement not found." };
  if (row.status !== "draft") return { ok: false, error: "This announcement was already sent." };

  const spec = targetSpec({
    templateId: row.template_id,
    subject: row.subject,
    body: row.body,
    targetType: row.target_type,
    targetRole: row.target_role,
    targetCourseId: row.target_course_id,
  });
  if ("ok" in spec) return spec;

  let recipients;
  try {
    recipients = await resolveTargets(supabase, spec);
  } catch {
    return { ok: false, error: "Could not resolve the audience." };
  }

  await supabase.from("announcements").update({ status: "sending" }).eq("id", announcementId);

  const admin = createAdminClient();
  const html = announcementToEmailHtml(row.subject, row.body);
  const deliveryRows: {
    announcement_id: string;
    user_id: string;
    email: string;
    channel: "in_app" | "email";
    status: "sent" | "failed";
    error: string | null;
  }[] = [];

  for (const recipient of recipients) {
    const inApp = await notify({ userId: recipient.userId, category: "system", title: row.subject, body: row.body });
    deliveryRows.push({
      announcement_id: announcementId,
      user_id: recipient.userId,
      email: recipient.email,
      channel: "in_app",
      status: inApp ? "sent" : "failed",
      error: inApp ? null : "Notification preferences disabled this category.",
    });

    const emailResult = await sendEmail({ to: recipient.email, subject: row.subject, html });
    deliveryRows.push({
      announcement_id: announcementId,
      user_id: recipient.userId,
      email: recipient.email,
      channel: "email",
      status: emailResult.ok ? "sent" : "failed",
      error: emailResult.ok ? null : emailResult.error,
    });
  }

  if (deliveryRows.length > 0) await admin.from("announcement_deliveries").insert(deliveryRows);

  const finalStatus = recipients.length === 0 || deliveryRows.some((d) => d.status === "sent") ? "sent" : "failed";
  await supabase.from("announcements").update({ status: finalStatus, sent_at: new Date().toISOString() }).eq("id", announcementId);

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "communication.announcement_sent",
    resourceType: "announcement",
    resourceId: announcementId,
    metadata: { targetType: spec.targetType, recipientCount: recipients.length },
  });

  revalidatePath("/admin/notifications");
  return { ok: true };
}

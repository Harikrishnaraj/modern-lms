import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_IDS, ROLE_LABEL, isRoleId, type RoleId } from "./user-rules";

export { ROLE_IDS, ROLE_LABEL, isRoleId };
export type { RoleId };

export const TARGET_TYPES = ["all_learners", "role", "course"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
export const isTargetType = (v: unknown): v is TargetType => (TARGET_TYPES as readonly string[]).includes(v as string);

export interface AnnouncementTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  templateId: string | null;
  subject: string;
  body: string;
  targetType: TargetType;
  targetRole: string | null;
  targetCourseId: string | null;
  status: "draft" | "sending" | "sent" | "failed";
  createdAt: string;
  sentAt: string | null;
}

export interface DeliveryLogRow {
  id: string;
  userId: string | null;
  email: string;
  channel: "in_app" | "email";
  status: "sent" | "failed";
  error: string | null;
  createdAt: string;
}

interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}
const toTemplate = (r: TemplateRow): AnnouncementTemplate => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

interface AnnouncementRow {
  id: string;
  template_id: string | null;
  subject: string;
  body: string;
  target_type: string;
  target_role: string | null;
  target_course_id: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
}
const toAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: r.id,
  templateId: r.template_id,
  subject: r.subject,
  body: r.body,
  targetType: isTargetType(r.target_type) ? r.target_type : "all_learners",
  targetRole: r.target_role,
  targetCourseId: r.target_course_id,
  status: r.status === "sending" || r.status === "sent" || r.status === "failed" ? r.status : "draft",
  createdAt: r.created_at,
  sentAt: r.sent_at,
});

export async function listTemplates(supabase: SupabaseClient): Promise<AnnouncementTemplate[]> {
  const { data, error } = await supabase.from("announcement_templates").select("*").order("name");
  if (error) throw new Error(`listTemplates failed: ${error.message}`);
  return ((data ?? []) as TemplateRow[]).map(toTemplate);
}

export async function listAnnouncements(supabase: SupabaseClient): Promise<Announcement[]> {
  const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`listAnnouncements failed: ${error.message}`);
  return ((data ?? []) as AnnouncementRow[]).map(toAnnouncement);
}

interface DeliveryRow {
  id: string;
  user_id: string | null;
  email: string;
  channel: string;
  status: string;
  error: string | null;
  created_at: string;
}
const toDelivery = (r: DeliveryRow): DeliveryLogRow => ({
  id: r.id,
  userId: r.user_id,
  email: r.email,
  channel: r.channel === "email" ? "email" : "in_app",
  status: r.status === "sent" ? "sent" : "failed",
  error: r.error,
  createdAt: r.created_at,
});

export async function getDeliveryLog(supabase: SupabaseClient, announcementId: string): Promise<DeliveryLogRow[]> {
  const { data, error } = await supabase
    .from("announcement_deliveries")
    .select("id, user_id, email, channel, status, error, created_at")
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getDeliveryLog failed: ${error.message}`);
  return ((data ?? []) as DeliveryRow[]).map(toDelivery);
}

export interface TargetSpec {
  targetType: TargetType;
  targetRole: string | null;
  targetCourseId: string | null;
}

export interface Recipient {
  userId: string;
  email: string;
}

/** Same RPC the send action uses, so a previewed count always matches who actually gets it. */
export async function resolveTargets(supabase: SupabaseClient, spec: TargetSpec): Promise<Recipient[]> {
  const { data, error } = await supabase.rpc("resolve_announcement_targets", {
    p_target_type: spec.targetType,
    p_target_role: spec.targetRole,
    p_target_course_id: spec.targetCourseId,
  });
  if (error) throw new Error(`resolve_announcement_targets failed: ${error.message}`);
  return ((data ?? []) as { user_id: string; email: string }[]).map((r) => ({ userId: r.user_id, email: r.email }));
}

/** Wraps plain announcement text in a minimal HTML shell for the email channel. */
export function announcementToEmailHtml(subject: string, body: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html><html><body><h2>${escape(subject)}</h2>${paragraphs}</body></html>`;
}

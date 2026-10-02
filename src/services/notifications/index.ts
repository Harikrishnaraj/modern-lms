import { captureError } from "@/services/error-tracking";
import { createAdminClient } from "@/services/supabase/admin";
import { isCategory, safeHref, type NotificationCategory } from "@/features/notifications/notifications";

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  href?: string;
}

/**
 * Creates an in-app notification unless the user switched that category off. Server-only (service
 * role). Never throws: a failed notification must not undo the action that caused it.
 * Returns true when a row was created.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  try {
    if (!isCategory(input.category)) return false;
    const admin = createAdminClient();
    const { data: pref } = await admin
      .from("notification_preferences")
      .select("in_app")
      .eq("user_id", input.userId)
      .eq("category", input.category)
      .maybeSingle();
    if (pref && pref.in_app === false) return false;
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      category: input.category,
      title: input.title.slice(0, 200),
      body: (input.body ?? "").slice(0, 1000),
      href: safeHref(input.href) ?? null,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    void captureError("notification.send_failed", err, { category: input.category });
    return false;
  }
}

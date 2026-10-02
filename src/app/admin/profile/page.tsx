import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm, ProfileForm } from "@/components/profile/profile-forms";
import { PrivacyPanel } from "@/components/profile/privacy-panel";
import { PreferenceToggle } from "@/components/notifications/notification-controls";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { History } from "lucide-react";
import { getMyRecentActions } from "@/features/admin/my-actions";
import { CATEGORIES, CATEGORY_LABEL, getPreferences } from "@/features/notifications/notifications";
import { getMyDeletionStatus } from "@/features/privacy/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, prefs, recentActions, deletionRequestedAt] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    getPreferences(supabase, user.id),
    getMyRecentActions(supabase, user.id),
    getMyDeletionStatus(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader title="Profile" description="Your personal info, security and recent actions." />
      <div className="space-y-10">
        <section aria-labelledby="profile-heading" className="space-y-4">
          <h2 id="profile-heading" className="text-base font-semibold">
            Profile
          </h2>
          <ProfileForm initialName={(profile?.full_name as string | null) ?? ""} email={user.email ?? ""} avatarUrl={(profile?.avatar_url as string | null) ?? null} />
        </section>

        <section aria-labelledby="password-heading" className="space-y-4">
          <h2 id="password-heading" className="text-base font-semibold">
            Password
          </h2>
          <PasswordForm />
        </section>

        <section aria-labelledby="notif-heading" className="max-w-2xl space-y-2">
          <h2 id="notif-heading" className="text-base font-semibold">
            Notification preferences
          </h2>
          <ul className="divide-y divide-border-subtle">
            {CATEGORIES.map((c) => (
              <PreferenceToggle key={c} category={c} label={CATEGORY_LABEL[c].label} description={CATEGORY_LABEL[c].description} initial={prefs[c]} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent-heading" className="space-y-2">
          <h2 id="recent-heading" className="text-base font-semibold">
            My recent actions
          </h2>
          {recentActions.length === 0 ? (
            <EmptyState icon={History} title="No recent actions" description="Actions you take as an admin will appear here." />
          ) : (
            <ul className="divide-y divide-border-subtle rounded-card border border-border">
              {recentActions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <p className="font-medium">{a.action}</p>
                    <p className="text-xs text-text-secondary">
                      {a.resourceType}
                      {a.resourceId && ` #${a.resourceId.slice(0, 8)}`}
                    </p>
                  </div>
                  <span className="text-xs text-text-secondary">{dateFormat.format(new Date(a.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="privacy-heading" className="space-y-4">
          <h2 id="privacy-heading" className="text-base font-semibold">
            Privacy
          </h2>
          <PrivacyPanel deletionRequestedAt={deletionRequestedAt} />
        </section>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordForm, ProfileForm } from "@/components/profile/profile-forms";
import { PrivacyPanel } from "@/components/profile/privacy-panel";
import { ApplyToTeach } from "@/components/instructor/apply-to-teach";
import { PageHeader } from "@/components/layout/page-header";
import { getMyInstructorApplication } from "@/features/instructor/application";
import { getMyDeletionStatus } from "@/features/privacy/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function LearnerSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: roles }, application, deletionRequestedAt] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role_id").eq("user_id", user.id),
    getMyInstructorApplication(supabase, user.id),
    getMyDeletionStatus(supabase, user.id),
  ]);
  const isInstructor = (roles ?? []).some((r) => r.role_id === "instructor");

  return (
    <>
      <PageHeader title="Settings" description="Your profile, password and notification preferences." />
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

        <section aria-labelledby="notif-heading" className="space-y-2">
          <h2 id="notif-heading" className="text-base font-semibold">
            Notifications
          </h2>
          <p className="text-sm text-text-secondary">
            Choose which updates you receive in{" "}
            <Link href="/learner/notifications#prefs-heading" className="text-primary underline">
              your notification preferences
            </Link>
            .
          </p>
        </section>

        {!isInstructor && (
          <section aria-labelledby="teach-heading" className="space-y-4">
            <h2 id="teach-heading" className="text-base font-semibold">
              Teach on Modern LMS
            </h2>
            <ApplyToTeach application={application} />
          </section>
        )}

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

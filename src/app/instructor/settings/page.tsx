import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordForm, ProfileForm } from "@/components/profile/profile-forms";
import { PrivacyPanel } from "@/components/profile/privacy-panel";
import { PageHeader } from "@/components/layout/page-header";
import { PublicProfileForm } from "@/components/instructor/public-profile-form";
import { PayoutDetailsForm } from "@/components/instructor/payout-details-form";
import { getPayoutDetails, getPublicProfile } from "@/features/instructor/settings";
import { getMyDeletionStatus } from "@/features/privacy/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings | Instructor" };

export default async function InstructorSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/instructor/settings");

  const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle();
  const [publicProfile, payoutDetails, deletionRequestedAt] = await Promise.all([
    getPublicProfile(supabase, user.id),
    getPayoutDetails(supabase, user.id),
    getMyDeletionStatus(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Your profile, public teaching profile, payout details and notifications." />
      <div className="space-y-10">
        <section aria-labelledby="profile-heading" className="space-y-4">
          <h2 id="profile-heading" className="text-base font-semibold">
            Profile
          </h2>
          <ProfileForm
            initialName={(profile?.full_name as string | null) ?? ""}
            email={user.email ?? ""}
            avatarUrl={(profile?.avatar_url as string | null) ?? null}
          />
        </section>

        <section aria-labelledby="public-profile-heading" className="space-y-4">
          <h2 id="public-profile-heading" className="text-base font-semibold">
            Public profile
          </h2>
          <PublicProfileForm initialHeadline={publicProfile.headline ?? ""} initialBio={publicProfile.bio ?? ""} />
        </section>

        <section aria-labelledby="payout-heading" className="space-y-4">
          <h2 id="payout-heading" className="text-base font-semibold">
            Payout details
          </h2>
          <PayoutDetailsForm
            initialMethod={payoutDetails?.payoutMethod ?? null}
            initialReference={payoutDetails?.payoutReference ?? ""}
          />
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
            <Link href="/instructor/notifications#prefs-heading" className="text-primary underline">
              your notification preferences
            </Link>
            .
          </p>
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

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MfaForm } from "@/components/forms/mfa-form";
import { startMfaEnrollment, verifyMfa } from "@/features/auth/mfa";
import { createClient } from "@/lib/supabase/server";
import { needsMfa, safeNextPath } from "@/lib/permissions/mfa";

export const metadata = { title: "Two-factor authentication" };

// Outside /admin on purpose: the admin proxy guard sends users here, so this
// page must not itself require AAL2. It needs a signed-in user, though.
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(safeNextPath(next))}`);
  if (!(await needsMfa(supabase))) redirect(safeNextPath(next));

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp[0]; // listFactors().totp only holds verified factors

  let factorId: string;
  let setup: { qrCode: string; secret: string } | null = null;
  if (verified) {
    factorId = verified.id;
  } else {
    const enrollment = await startMfaEnrollment();
    if ("error" in enrollment) {
      return (
        <main className="mx-auto max-w-md px-4 py-16">
          <p role="alert">{enrollment.error}</p>
        </main>
      );
    }
    factorId = enrollment.factorId;
    setup = enrollment;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader
          title={setup ? "Set up two-factor authentication" : "Two-factor authentication"}
          description={
            setup
              ? "This account requires an authenticator app. Scan the QR code, then enter the 6-digit code."
              : "Enter the 6-digit code from your authenticator app."
          }
        />
        <CardContent>
          {setup && (
            <div className="mb-4 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Supabase */}
              <img src={setup.qrCode} alt="Authenticator QR code" className="size-40" />
              <p className="text-xs text-text-secondary">
                Can&apos;t scan? Enter this key manually:
              </p>
              <code data-testid="mfa-secret" className="text-sm break-all">
                {setup.secret}
              </code>
            </div>
          )}
          <div className="mb-3 flex items-center gap-2 text-sm text-text-secondary">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>Required for back-office access</span>
          </div>
          <MfaForm onSubmit={verifyMfa.bind(null, next ?? null, factorId)} />
        </CardContent>
      </Card>
    </main>
  );
}

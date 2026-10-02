"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/permissions/mfa";
import { log } from "@/lib/log";

const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

export type MfaEnrollment = { factorId: string; qrCode: string; secret: string };

// Starts TOTP enrolment for the signed-in user. Stale unverified factors are
// removed first, and each enrolment gets a unique friendly name: the /mfa page
// can be rendered twice in quick succession (seen under a vinext build), and
// two concurrent enrolments with the same (empty) name hit
// mfa_factor_name_conflict. Each render then shows its own valid factor; the
// unverified leftovers are removed on the next visit.
export async function startMfaEnrollment(): Promise<MfaEnrollment | { error: string }> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Please log in again." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${crypto.randomUUID().slice(0, 8)}`,
  });
  if (error || !data) {
    log.warn("auth.mfa_enroll_failed", { code: error?.code, status: error?.status, message: error?.message });
    return { error: "Could not start two-factor setup. Try again." };
  }
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

// Verifies a TOTP code (enrolment confirmation and login challenge are the
// same call) and upgrades the session to AAL2, then continues to `next`.
export async function verifyMfa(
  next: string | null,
  factorId: string,
  code: string,
): Promise<{ error: string } | void> {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
  if (error) return { error: "That code is incorrect or expired." };

  redirect(safeNextPath(next));
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type CertificateActionResult = { ok: true } | { ok: false; error: string };
export type ReissueResult = { ok: true; code: string } | { ok: false; error: string };

export async function revokeCertificateAction(certificateId: string, reason: string): Promise<CertificateActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const trimmed = reason.trim();
  if (trimmed === "") return { ok: false, error: "Enter a reason for revoking this certificate." };

  const { error } = await supabase.rpc("admin_revoke_certificate", { p_certificate_id: certificateId, p_reason: trimmed });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "certificate.revoked",
    resourceType: "certificate",
    resourceId: certificateId,
    metadata: { reason: trimmed },
  });

  revalidatePath("/admin/certificates");
  return { ok: true };
}

export async function reissueCertificateAction(certificateId: string): Promise<ReissueResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data, error } = await supabase.rpc("admin_reissue_certificate", { p_certificate_id: certificateId });
  if (error) return { ok: false, error: error.message };

  const reissued = (data as { certificate_id: string; code: string }[])[0];
  if (!reissued) return { ok: false, error: "The certificate could not be reissued." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "certificate.reissued",
    resourceType: "certificate",
    resourceId: reissued.certificate_id,
    metadata: { sourceCertificateId: certificateId, code: reissued.code },
  });

  revalidatePath("/admin/certificates");
  return { ok: true, code: reissued.code };
}

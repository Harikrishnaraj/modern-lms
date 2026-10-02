import type { SupabaseClient } from "@supabase/supabase-js";

export interface MyCertificate {
  id: string;
  code: string;
  courseTitle: string;
  instructorName: string | null;
  issuedAt: string;
  status: "issued" | "revoked";
}

export interface PublicCertificate {
  code: string;
  status: "issued" | "revoked";
  learnerName: string;
  courseTitle: string;
  instructorName: string | null;
  signatureTitle: string | null;
  closingMessage: string | null;
  issuedAt: string;
  revokedAt: string | null;
}

const CODE = /^MLC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

/** Uppercases/trims a user-typed code; null when it cannot be a certificate ID. */
export function normalizeCertificateCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

export async function getMyCertificates(
  supabase: SupabaseClient,
  userId: string,
): Promise<MyCertificate[]> {
  const { data, error } = await supabase
    .from("certificates")
    .select("id, code, course_title, instructor_name, issued_at, status")
    .eq("user_id", userId)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(`certificates failed: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    courseTitle: c.course_title as string,
    instructorName: (c.instructor_name as string | null) ?? null,
    issuedAt: c.issued_at as string,
    status: c.status as "issued" | "revoked",
  }));
}

/** Public lookup through the verify_certificate RPC: returns only what is printed on the certificate. */
export async function verifyCertificate(
  supabase: SupabaseClient,
  rawCode: string,
): Promise<PublicCertificate | null> {
  const code = normalizeCertificateCode(rawCode);
  if (!code) return null;
  const { data, error } = await supabase.rpc("verify_certificate", { p_code: code });
  if (error) throw new Error(`verify_certificate failed: ${error.message}`);
  const row = (data ?? [])[0] as
    | {
        code: string;
        status: "issued" | "revoked";
        learner_name: string;
        course_title: string;
        instructor_name: string | null;
        signature_title: string | null;
        closing_message: string | null;
        issued_at: string;
        revoked_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    code: row.code,
    status: row.status,
    learnerName: row.learner_name,
    courseTitle: row.course_title,
    instructorName: row.instructor_name,
    signatureTitle: row.signature_title,
    closingMessage: row.closing_message,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
  };
}

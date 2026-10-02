import type { SupabaseClient } from "@supabase/supabase-js";

export interface InstructorCertificate {
  id: string;
  code: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  instructorName: string | null;
  status: "issued" | "revoked";
  issuedAt: string;
  revokedAt: string | null;
}

export interface CertificateTemplate {
  courseId: string;
  signatureTitle: string | null;
  closingMessage: string | null;
  updatedAt: string;
}

interface CertificateRow {
  id: string;
  code: string;
  course_id: string;
  course_title: string;
  learner_name: string;
  instructor_name: string | null;
  status: "issued" | "revoked";
  issued_at: string;
  revoked_at: string | null;
}

interface TemplateRow {
  course_id: string;
  signature_title: string | null;
  closing_message: string | null;
  updated_at: string;
}

/** Certificates issued for courses owned by the calling instructor. */
export async function getInstructorCertificates(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorCertificate[]> {
  const { data, error } = await supabase.rpc("instructor_certificates", {
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`getInstructorCertificates failed: ${error.message}`);
  return ((data ?? []) as CertificateRow[]).map((r) => ({
    id: r.id,
    code: r.code,
    courseId: r.course_id,
    courseTitle: r.course_title,
    learnerName: r.learner_name,
    instructorName: r.instructor_name,
    status: r.status,
    issuedAt: r.issued_at,
    revokedAt: r.revoked_at,
  }));
}

/** The certificate template for one of the instructor's own courses, if one has been saved. */
export async function getCertificateTemplate(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CertificateTemplate | null> {
  const { data, error } = await supabase
    .from("certificate_templates")
    .select("course_id, signature_title, closing_message, updated_at")
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw new Error(`getCertificateTemplate failed: ${error.message}`);
  if (!data) return null;
  const row = data as TemplateRow;
  return {
    courseId: row.course_id,
    signatureTitle: row.signature_title,
    closingMessage: row.closing_message,
    updatedAt: row.updated_at,
  };
}

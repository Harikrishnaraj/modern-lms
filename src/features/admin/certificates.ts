import type { SupabaseClient } from "@supabase/supabase-js";

export const CERTIFICATES_PAGE_SIZE = 25;

export type CertificateStatus = "issued" | "revoked";

export interface AdminCertificate {
  certificateId: string;
  code: string;
  userId: string;
  learnerName: string;
  learnerEmail: string | null;
  courseId: string;
  courseTitle: string;
  status: CertificateStatus;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface Row {
  certificate_id: string;
  code: string;
  user_id: string;
  learner_name: string;
  learner_email: string | null;
  course_id: string;
  course_title: string;
  status: CertificateStatus;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  total: number | string;
}

export interface CertificateQuery {
  q: string;
  status: CertificateStatus | "";
  courseId: string;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCertificateQuery(params: Params): CertificateQuery {
  const status = one(params.status);
  const courseId = one(params.courseId);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    status: status === "issued" || status === "revoked" ? status : "",
    courseId: UUID.test(courseId) ? courseId : "",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

/** One page of certificates matching the search/filters. Requires course.read_all. */
export async function searchAdminCertificates(
  supabase: SupabaseClient,
  query: CertificateQuery,
): Promise<{ certificates: AdminCertificate[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_search_certificates", {
    p_q: query.q,
    p_status: query.status,
    p_course_id: query.courseId || null,
    p_limit: CERTIFICATES_PAGE_SIZE,
    p_offset: (query.page - 1) * CERTIFICATES_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_search_certificates failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return {
    certificates: rows.map((r) => ({
      certificateId: r.certificate_id,
      code: r.code,
      userId: r.user_id,
      learnerName: r.learner_name,
      learnerEmail: r.learner_email,
      courseId: r.course_id,
      courseTitle: r.course_title,
      status: r.status,
      issuedAt: r.issued_at,
      revokedAt: r.revoked_at,
      revokedReason: r.revoked_reason,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

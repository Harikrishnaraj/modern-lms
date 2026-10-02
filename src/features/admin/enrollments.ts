import type { SupabaseClient } from "@supabase/supabase-js";

export type EnrollmentStatus = "active" | "completed" | "cancelled";
export const ENROLLMENTS_PAGE_SIZE = 25;

export interface AdminEnrollment {
  enrollmentId: string;
  userId: string;
  learnerName: string | null;
  learnerEmail: string | null;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt: string | null;
}

export interface EnrollmentQuery {
  q: string;
  status: EnrollmentStatus | "";
  courseId: string;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseEnrollmentQuery(params: Params): EnrollmentQuery {
  const status = one(params.status);
  const courseId = one(params.courseId);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    status: status === "active" || status === "completed" || status === "cancelled" ? status : "",
    courseId: UUID.test(courseId) ? courseId : "",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

interface Row {
  enrollment_id: string;
  user_id: string;
  learner_name: string | null;
  learner_email: string | null;
  course_id: string;
  course_title: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  total: number | string;
}

/** One page of enrollments (filtered and paged in the database). Requires course.read_all. */
export async function getAdminEnrollments(
  supabase: SupabaseClient,
  query: EnrollmentQuery,
): Promise<{ enrollments: AdminEnrollment[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_enrollments", {
    p_q: query.q,
    p_status: query.status,
    p_course_id: query.courseId || null,
    p_limit: ENROLLMENTS_PAGE_SIZE,
    p_offset: (query.page - 1) * ENROLLMENTS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_enrollments failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return {
    enrollments: rows.map((r) => ({
      enrollmentId: r.enrollment_id,
      userId: r.user_id,
      learnerName: r.learner_name,
      learnerEmail: r.learner_email,
      courseId: r.course_id,
      courseTitle: r.course_title,
      status: r.status,
      enrolledAt: r.enrolled_at,
      completedAt: r.completed_at,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

export interface AdminCohort {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface CohortRow {
  id: string;
  name: string;
  member_count: number | string;
  created_at: string;
}

/** Every cohort with its member count. Requires enrollments.manage. */
export async function getAdminCohorts(supabase: SupabaseClient): Promise<AdminCohort[]> {
  const { data, error } = await supabase.rpc("admin_cohorts");
  if (error) throw new Error(`admin_cohorts failed: ${error.message}`);
  return ((data ?? []) as CohortRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    memberCount: Number(r.member_count),
    createdAt: r.created_at,
  }));
}

export interface CohortMember {
  userId: string;
  fullName: string | null;
  email: string | null;
  addedAt: string;
}

interface MemberRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  added_at: string;
}

/** Members of one cohort. Requires enrollments.manage. */
export async function getCohortMembers(supabase: SupabaseClient, cohortId: string): Promise<CohortMember[]> {
  const { data, error } = await supabase.rpc("admin_cohort_members", { p_cohort_id: cohortId });
  if (error) throw new Error(`admin_cohort_members failed: ${error.message}`);
  return ((data ?? []) as MemberRow[]).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    addedAt: r.added_at,
  }));
}

export function validateCohortName(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a cohort name." };
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter a cohort name." };
  if (value.length > 150) return { ok: false, error: "Keep the name under 150 characters." };
  return { ok: true, value };
}

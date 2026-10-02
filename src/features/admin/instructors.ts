import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminInstructor {
  userId: string;
  fullName: string | null;
  email: string | null;
  courseCount: number;
  publishedCourseCount: number;
  totalLearners: number;
  ratingAvg: number;
  createdAt: string;
}

export type InstructorSort = "top" | "newest";
export const INSTRUCTORS_PAGE_SIZE = 25;

interface InstructorRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  course_count: number | string;
  published_course_count: number | string;
  total_learners: number | string;
  rating_avg: number | string;
  created_at: string;
  total: number | string;
}

/** Every instructor with course/learner/rating stats. Requires user.read_all. */
export async function getAdminInstructors(
  supabase: SupabaseClient,
  opts: { q?: string; sort?: InstructorSort; page?: number } = {},
): Promise<{ instructors: AdminInstructor[]; total: number }> {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const { data, error } = await supabase.rpc("admin_instructors", {
    p_q: opts.q ?? "",
    p_sort: opts.sort ?? "top",
    p_limit: INSTRUCTORS_PAGE_SIZE,
    p_offset: (page - 1) * INSTRUCTORS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_instructors failed: ${error.message}`);
  const rows = (data ?? []) as InstructorRow[];
  return {
    instructors: rows.map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      email: r.email,
      courseCount: Number(r.course_count),
      publishedCourseCount: Number(r.published_course_count),
      totalLearners: Number(r.total_learners),
      ratingAvg: Number(r.rating_avg),
      createdAt: r.created_at,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

export interface InstructorApplicationRow {
  id: string;
  userId: string;
  applicantName: string | null;
  applicantEmail: string | null;
  message: string;
  status: "pending" | "approved" | "rejected";
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  applicant_name: string | null;
  applicant_email: string | null;
  message: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

/** Instructor applications, defaulting to the pending verification queue. Requires user.read_all. */
export async function getInstructorApplications(
  supabase: SupabaseClient,
  status: "pending" | "approved" | "rejected" | "" = "pending",
): Promise<InstructorApplicationRow[]> {
  const { data, error } = await supabase.rpc("admin_instructor_applications", { p_status: status });
  if (error) throw new Error(`admin_instructor_applications failed: ${error.message}`);
  return ((data ?? []) as ApplicationRow[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    applicantName: r.applicant_name,
    applicantEmail: r.applicant_email,
    message: r.message,
    status: r.status,
    reviewedByName: r.reviewed_by_name,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    createdAt: r.created_at,
  }));
}

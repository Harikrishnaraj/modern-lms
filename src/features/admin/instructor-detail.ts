import type { SupabaseClient } from "@supabase/supabase-js";

export interface InstructorCourseSummary {
  courseId: string;
  slug: string;
  title: string;
  status: string;
  isLive: boolean;
  learners: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface InstructorDetail {
  userId: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  courses: InstructorCourseSummary[];
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

interface Payload {
  profile: { user_id: string; full_name: string | null; email: string | null; created_at: string };
  courses: {
    course_id: string;
    slug: string;
    title: string;
    status: string;
    is_live: boolean;
    learners: number;
    rating_avg: number | string;
    rating_count: number;
  }[];
  rating_distribution: Record<string, number>;
}

/** An instructor's account, courses and rating distribution. Null if not found. Requires user.read_all. */
export async function getAdminInstructorDetail(supabase: SupabaseClient, userId: string): Promise<InstructorDetail | null> {
  const { data, error } = await supabase.rpc("admin_instructor_detail", { p_user_id: userId });
  if (error) throw new Error(`admin_instructor_detail failed: ${error.message}`);
  if (!data) return null;
  const d = data as Payload;
  return {
    userId: d.profile.user_id,
    fullName: d.profile.full_name,
    email: d.profile.email,
    createdAt: d.profile.created_at,
    courses: d.courses.map((c) => ({
      courseId: c.course_id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      isLive: c.is_live,
      learners: Number(c.learners),
      ratingAvg: Number(c.rating_avg),
      ratingCount: c.rating_count,
    })),
    ratingDistribution: {
      1: d.rating_distribution["1"] ?? 0,
      2: d.rating_distribution["2"] ?? 0,
      3: d.rating_distribution["3"] ?? 0,
      4: d.rating_distribution["4"] ?? 0,
      5: d.rating_distribution["5"] ?? 0,
    },
  };
}

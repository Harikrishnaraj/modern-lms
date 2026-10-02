import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMyDeletionStatus(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("deletion_requested_at").eq("id", userId).maybeSingle();
  return (data?.deletion_requested_at as string | null) ?? null;
}

/**
 * Every table a learner/instructor's own activity lands in, scoped to their own rows (RLS also
 * enforces this; the explicit .eq is defense in depth, matching the rest of the codebase). Scoped
 * to the account's core PII and activity record -- not every table that could ever reference a
 * user (e.g. who reviewed a course submission) -- since SECURITY.md §21 asks for "data export",
 * not a full relational graph dump.
 */
export async function getMyDataExport(supabase: SupabaseClient, userId: string) {
  const [profile, roles, enrollments, submissions, certificates, reviews, orgMemberships] = await Promise.all([
    supabase.from("profiles").select("full_name, headline, bio, avatar_url, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role_id, created_at").eq("user_id", userId),
    supabase.from("enrollments").select("course_id, status, enrolled_at, completed_at").eq("user_id", userId),
    supabase
      .from("assignment_submissions")
      .select("assignment_id, text_answer, file_name, status, is_late, submitted_at, grade, feedback")
      .eq("user_id", userId),
    supabase.from("certificates").select("code, course_title, issued_at, status").eq("user_id", userId),
    supabase.from("course_ratings").select("course_id, rating, body, instructor_reply, created_at").eq("user_id", userId),
    supabase.from("organization_members").select("organization_id, org_role, created_at").eq("user_id", userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profile.data ?? null,
    roles: roles.data ?? [],
    enrollments: enrollments.data ?? [],
    assignmentSubmissions: submissions.data ?? [],
    certificates: certificates.data ?? [],
    courseReviews: reviews.data ?? [],
    organizationMemberships: orgMemberships.data ?? [],
  };
}

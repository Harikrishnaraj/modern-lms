import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CohortDetailPanel } from "@/components/admin/cohort-detail-panel";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminCohorts, getCohortMembers } from "@/features/admin/enrollments";
import { getAdminCourses } from "@/features/admin/courses";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cohort" };

export default async function AdminCohortDetailPage({ params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "enrollments.manage"))) {
    return (
      <>
        <PageHeader title="Cohort" />
        <PermissionDeniedState title="You cannot manage cohorts" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [cohorts, members, allCourses] = await Promise.all([
    getAdminCohorts(supabase),
    getCohortMembers(supabase, cohortId),
    getAdminCourses(supabase),
  ]);
  const cohort = cohorts.find((c) => c.id === cohortId);
  if (!cohort) notFound();

  const liveCourses = allCourses.filter((c) => c.isLive).map((c) => ({ id: c.courseId, title: c.title }));

  return (
    <>
      <PageHeader
        title={cohort.name}
        description={`${cohort.memberCount} ${cohort.memberCount === 1 ? "member" : "members"}`}
        actions={
          <Link href="/admin/enrollments" className="text-sm text-primary hover:underline">
            ← Back to enrollments
          </Link>
        }
      />
      <CohortDetailPanel cohortId={cohortId} members={members} courses={liveCourses} />
    </>
  );
}

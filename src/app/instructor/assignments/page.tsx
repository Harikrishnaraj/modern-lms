import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Library } from "lucide-react";
import { AssignmentHubForm } from "@/components/assignments/assignment-hub-form";
import { AssignmentsTable, type TableRow } from "@/components/assignments/assignments-table";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { getAssignableCourses, getAssignmentOverview } from "@/features/assignments/hub";
import { overviewStatus } from "@/features/assignments/hub-rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assignments" };

export default async function InstructorAssignmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [courses, overview] = await Promise.all([getAssignableCourses(supabase, user.id), getAssignmentOverview(supabase)]);
  const now = new Date();
  const rows: TableRow[] = overview.map((r) => ({
    id: r.id,
    title: r.title,
    courseId: r.courseId,
    courseTitle: r.courseTitle,
    dueAt: r.dueAt,
    maxPoints: r.maxPoints,
    submissions: r.submissions,
    ungraded: r.ungraded,
    enrolled: r.enrolled,
    status: overviewStatus(r, now),
    editable: r.versionStatus === "draft" || r.versionStatus === "changes_requested",
  }));

  return (
    <>
      <PageHeader title="Assignments" description="Create assignments for your courses and track submissions in one place." />
      {courses.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Create a course first"
          description="Assignments belong to a course. Once you have a course, you can assign work to its learners here."
          action={
            <Link href="/instructor/courses/new" className={buttonClasses()}>
              Create a course
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <AssignmentHubForm courses={courses} />
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No assignments yet" description="Assignments you create will be listed here with their submissions." />
          ) : (
            <AssignmentsTable rows={rows} />
          )}
        </div>
      )}
    </>
  );
}

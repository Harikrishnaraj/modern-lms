import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { AssignmentEditor } from "@/components/course-authoring/assignment-editor";
import { PageHeader } from "@/components/layout/page-header";
import { getAssignmentResources } from "@/features/assignments/resources";
import { getAssignmentForEditing } from "@/features/course-authoring/assignment-authoring";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentEditPage({ params }: { params: Promise<{ courseId: string; assignmentId: string }> }) {
  const { courseId, assignmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();
  const assignment = await getAssignmentForEditing(supabase, course.version.id, assignmentId);
  if (!assignment) notFound();
  const resources = await getAssignmentResources(supabase, assignment.id);
  const { submissions, id: _id, versionId: _v, ...initial } = assignment;
  void _id;
  void _v;

  return (
    <>
      <Link href={`/instructor/courses/${course.courseId}/assignments`} className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All assignments
      </Link>
      <PageHeader title={assignment.title} description={course.version.title} />
      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so this assignment cannot be changed.
        </p>
      )}
      <AssignmentEditor
        courseId={course.courseId}
        assignmentId={assignment.id}
        initial={initial}
        resources={resources.map((r) => ({ key: r.id, name: r.name, size: r.sizeBytes }))}
        submissions={submissions}
        disabled={!course.editable}
      />
    </>
  );
}

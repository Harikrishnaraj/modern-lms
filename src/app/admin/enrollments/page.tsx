import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX, Users } from "lucide-react";
import { EnrollLearnerForm } from "@/components/admin/enroll-learner-form";
import { CohortsPanel } from "@/components/admin/cohorts-panel";
import { UnenrollButton } from "@/components/admin/unenroll-button";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ENROLLMENTS_PAGE_SIZE,
  getAdminEnrollments,
  getAdminCohorts,
  parseEnrollmentQuery,
  type EnrollmentQuery,
} from "@/features/admin/enrollments";
import { getAdminCourses } from "@/features/admin/courses";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Enrollments" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function href(q: EnrollmentQuery, over: Partial<EnrollmentQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.q) params.set("q", m.q);
  if (m.status) params.set("status", m.status);
  if (m.courseId) params.set("courseId", m.courseId);
  if (m.page > 1) params.set("page", String(m.page));
  const qs = params.toString();
  return qs ? `/admin/enrollments?${qs}` : "/admin/enrollments";
}

export default async function AdminEnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseEnrollmentQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Enrollments" />
        <PermissionDeniedState title="You cannot view enrollments" description="Ask an administrator if you need access." />
      </>
    );
  }

  const canManage = await can(supabase, user.id, "enrollments.manage");
  const [{ enrollments, total }, allCourses, cohorts] = await Promise.all([
    getAdminEnrollments(supabase, query),
    getAdminCourses(supabase),
    canManage ? getAdminCohorts(supabase) : Promise.resolve([]),
  ]);
  const liveCourses = allCourses.filter((c) => c.isLive).map((c) => ({ id: c.courseId, title: c.title }));
  const pages = Math.max(1, Math.ceil(total / ENROLLMENTS_PAGE_SIZE));
  const filtered = query.q !== "" || query.status !== "" || query.courseId !== "";

  return (
    <>
      <PageHeader title="Enrollments" description={`${total.toLocaleString("en-US")} ${total === 1 ? "enrollment" : "enrollments"}`} />

      {canManage && (
        <Card className="mb-6">
          <CardHeader title="Manually enroll a learner" />
          <CardContent>
            <EnrollLearnerForm courses={liveCourses} />
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card className="mb-6">
          <CardHeader title="Cohorts" description="Named groups of learners you can bulk-enroll into a course." />
          <CardContent>
            <CohortsPanel cohorts={cohorts} />
          </CardContent>
        </Card>
      )}

      <form method="get" action="/admin/enrollments" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search enrollments" type="search" name="q" defaultValue={query.q} maxLength={100} hint="Learner name or email" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={query.status} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Course
          <select name="courseId" defaultValue={query.courseId} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All courses</option>
            {allCourses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {enrollments.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No enrollments match"
            description="Try a different search, status or course."
            action={
              <Link href="/admin/enrollments" className={buttonClasses({ variant: "secondary" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState icon={Users} title="No enrollments yet" description="Enrollments will appear here as learners join courses." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">Learner</th>
                  <th scope="col" className="p-3">Course</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">Enrolled</th>
                  {canManage && <th scope="col" className="p-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {enrollments.map((e) => (
                  <tr key={e.enrollmentId}>
                    <td className="p-3">
                      <p className="font-medium">{e.learnerName ?? e.learnerEmail ?? "Unknown"}</p>
                      {e.learnerName && <p className="text-xs text-text-secondary">{e.learnerEmail}</p>}
                    </td>
                    <td className="p-3">{e.courseTitle}</td>
                    <td className="p-3">
                      <StatusBadge kind="enrollment" status={e.status} />
                    </td>
                    <td className="p-3">{dateFormat.format(new Date(e.enrolledAt))}</td>
                    {canManage && (
                      <td className="p-3">{e.status !== "cancelled" && <UnenrollButton userId={e.userId} courseId={e.courseId} />}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {query.page > 1 ? (
                <Link href={href(query, { page: query.page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {query.page} of {pages}
              </span>
              {query.page < pages ? (
                <Link href={href(query, { page: query.page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

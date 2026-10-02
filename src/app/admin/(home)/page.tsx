import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, BookOpen, CheckCircle2, Clock, GraduationCap, History, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { describeAction, getAdminOverview, getPendingReviews, getRecentActivity } from "@/features/admin/overview";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

const fmt = (n: number) => n.toLocaleString("en-US");

function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof BookOpen }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-light text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-text-secondary">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    </Card>
  );
}

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const canReview = await can(supabase, user.id, "course.review");
  const canAudit = await can(supabase, user.id, "audit.read");
  const [overview, pending, activity] = await Promise.all([
    getAdminOverview(supabase),
    canReview ? getPendingReviews(supabase) : Promise.resolve([]),
    canAudit ? getRecentActivity(supabase) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Overview" description="The platform at a glance." />

      <section aria-label="Key numbers" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Users" value={fmt(overview.usersTotal)} hint={`${fmt(overview.usersNew7d)} new in 7 days`} icon={Users} />
        <Kpi label="Instructors" value={fmt(overview.instructors)} icon={GraduationCap} />
        <Kpi label="Published courses" value={fmt(overview.coursesPublished)} icon={BookOpen} />
        <Kpi label="Enrollments" value={fmt(overview.enrollmentsTotal)} hint={`${fmt(overview.enrollments7d)} in 7 days`} icon={UserPlus} />
        <Kpi label="Completions" value={fmt(overview.completionsTotal)} icon={CheckCircle2} />
        <Kpi label="Certificates issued" value={fmt(overview.certificatesIssued)} icon={Award} />
        <Kpi label="Awaiting review" value={fmt(overview.coursesPendingReview)} icon={Clock} />
        <Kpi label="Suspended users" value={fmt(overview.usersSuspended)} icon={Users} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* min-w-0: grid items default to min-width:auto, which lets a long title or email widen
            the column past a phone screen instead of truncating/wrapping (T-251). */}
        <section aria-labelledby="pending-heading" className="min-w-0">
          <Card className="h-full">
            <CardHeader
              title="Pending actions"
              description={`${overview.coursesPendingReview} awaiting review, ${overview.coursesChangesRequested} with changes requested`}
              action={
                <Link href="/admin/courses" className="text-sm font-medium text-primary hover:underline">
                  All courses
                </Link>
              }
            />
            <CardContent>
              <h3 id="pending-heading" className="sr-only">
                Courses awaiting review
              </h3>
              {!canReview ? (
                <p className="text-sm text-text-secondary">Your role does not review courses.</p>
              ) : pending.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing waiting" description="Submitted courses will queue up here for review." />
              ) : (
                <ul className="space-y-2">
                  {pending.map((p) => (
                    <li key={p.courseId} className="flex items-center justify-between gap-3 rounded-control border border-border p-3">
                      <Link href={`/admin/courses/${p.courseId}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                        {p.title}
                      </Link>
                      <StatusBadge kind="course" status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="activity-heading" className="min-w-0">
          <Card className="h-full">
            <CardHeader
              title="Platform activity"
              action={
                canAudit ? (
                  <Link href="/admin/audit" className="text-sm font-medium text-primary hover:underline">
                    Audit log
                  </Link>
                ) : undefined
              }
            />
            <CardContent>
              <h3 id="activity-heading" className="sr-only">
                Recent activity
              </h3>
              {!canAudit ? (
                <p className="text-sm text-text-secondary">Your role cannot view the audit log.</p>
              ) : activity.length === 0 ? (
                <EmptyState icon={History} title="No activity yet" description="Reviews, role changes and other privileged actions appear here." />
              ) : (
                <ul className="space-y-2">
                  {activity.map((a) => (
                    <li key={a.id} className="rounded-control border border-border p-3 text-sm">
                      <p className="font-medium">{describeAction(a.action)}</p>
                      <p className="break-words text-xs text-text-secondary [overflow-wrap:anywhere]">
                        {a.actorEmail ?? "System"} · {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

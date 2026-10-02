import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleDollarSign, Star } from "lucide-react";
import { getAdminInstructorDetail } from "@/features/admin/instructor-detail";
import { getPayoutDetails, PAYOUT_METHODS } from "@/features/instructor/settings";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import type { CourseStatus } from "@/features/courses/course-status";

export const metadata: Metadata = { title: "Instructor detail" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function AdminInstructorDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "user.read_all"))) {
    return (
      <>
        <PageHeader title="Instructor detail" />
        <PermissionDeniedState title="You cannot view this instructor" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [detail, payout] = await Promise.all([
    getAdminInstructorDetail(supabase, userId),
    getPayoutDetails(supabase, userId),
  ]);
  if (!detail) notFound();

  const totalRatings = Object.values(detail.ratingDistribution).reduce((a, b) => a + b, 0);
  const totalLearners = detail.courses.reduce((n, c) => n + c.learners, 0);
  const payoutMethodLabel = payout ? PAYOUT_METHODS.find((m) => m.value === payout.payoutMethod)?.label ?? payout.payoutMethod : null;

  return (
    <>
      <PageHeader title={detail.fullName ?? detail.email ?? "Instructor"} description={detail.email ?? undefined} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Courses" description={`${detail.courses.length} total · ${totalLearners} learners`} />
            <CardContent>
              {detail.courses.length === 0 ? (
                <p className="text-sm text-text-secondary">This instructor has not created a course yet.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {detail.courses.map((c) => (
                    <li key={c.courseId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{c.title}</span>
                      <span className="flex shrink-0 items-center gap-2 text-text-secondary">
                        <StatusBadge kind="course" status={c.status as CourseStatus} />
                        <span>{c.learners} learners</span>
                        {c.ratingCount > 0 && <span>★ {c.ratingAvg.toFixed(1)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Rating distribution" description={`${totalRatings} total ratings across all courses`} />
            <CardContent>
              {totalRatings === 0 ? (
                <p className="text-sm text-text-secondary">No ratings yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {([5, 4, 3, 2, 1] as const).map((n) => {
                    const count = detail.ratingDistribution[n];
                    const pct = totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0;
                    return (
                      <li key={n} className="flex items-center gap-2 text-sm">
                        <span className="flex w-10 items-center gap-0.5 text-text-secondary">
                          {n} <Star className="size-3 fill-warning text-warning" aria-hidden="true" />
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border-subtle">
                          <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 text-right text-text-secondary">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Revenue"
              description="Not available yet — payment processing has not been built for this platform."
            />
            <CardContent>
              <EmptyState
                icon={CircleDollarSign}
                title="No revenue data"
                description="This screen will show real revenue once checkout and payouts are implemented."
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account" />
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Joined</span>
                <span>{dateFormat.format(new Date(detail.createdAt))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Courses</span>
                <span>{detail.courses.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Payout details" description="Set by the instructor themselves, ahead of real payout processing." />
            <CardContent className="space-y-3 text-sm">
              {payout ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Method</span>
                    <span>{payoutMethodLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-secondary">Reference</span>
                    <span className="truncate">{payout.payoutReference}</span>
                  </div>
                </>
              ) : (
                <p className="text-text-secondary">This instructor has not saved payout details yet.</p>
              )}
            </CardContent>
          </Card>

          <Link href="/admin/instructors" className="text-sm text-primary hover:underline">
            ← Back to all instructors
          </Link>
        </div>
      </div>
    </>
  );
}

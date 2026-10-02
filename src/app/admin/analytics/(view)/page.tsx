import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { SavedReportsPanel } from "@/components/admin/saved-reports-panel";
import { TrendChart } from "@/components/admin/trend-chart";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RANGES, getDailyAnalytics, getTopCourses, parseRange, summarize } from "@/features/admin/analytics";
import { getSavedReports } from "@/features/admin/reports";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const range = parseRange((await searchParams).range);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "analytics.read"))) {
    return (
      <>
        <PageHeader title="Analytics" />
        <PermissionDeniedState title="You cannot view analytics" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [points, top, savedReports] = await Promise.all([
    getDailyAnalytics(supabase, range),
    getTopCourses(supabase, range),
    getSavedReports(supabase),
  ]);
  const totals = summarize(points);
  const empty = totals.enrollments === 0 && totals.completions === 0 && totals.signups === 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Platform activity over the last ${range} days.`}
        actions={
          <nav aria-label="Date range" className="inline-flex rounded-control border border-border">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin/analytics?range=${r}`}
                aria-current={r === range ? "true" : undefined}
                className={cn("px-3 py-1.5 text-sm", r === range ? "bg-primary-light font-semibold text-primary" : "text-text-secondary")}
              >
                {r} days
              </Link>
            ))}
          </nav>
        }
      />

      <dl aria-label="Totals for the range" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Enrollments", value: totals.enrollments.toLocaleString("en-US") },
          { label: "Completions", value: totals.completions.toLocaleString("en-US") },
          { label: "Completion rate", value: totals.completionRate === null ? "No enrollments" : `${totals.completionRate}%` },
          { label: "New sign-ups", value: totals.signups.toLocaleString("en-US") },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <dt className="text-sm text-text-secondary">{k.label}</dt>
            <dd className="mt-1 text-2xl font-bold">{k.value}</dd>
          </Card>
        ))}
      </dl>

      {empty ? (
        <EmptyState icon={BarChart3} title="No activity in this range" description="Enrollments, completions and sign-ups will chart here as they happen." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Enrollments and completions" />
            <CardContent>
              <TrendChart points={points} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Most enrolled courses" description={`Last ${range} days`} />
            <CardContent>
              {top.length === 0 ? (
                <p className="text-sm text-text-secondary">No enrollments in this range.</p>
              ) : (
                <ol aria-label="Most enrolled courses" className="space-y-2">
                  {top.map((c, i) => (
                    <li key={c.courseId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {i + 1}. <Link href={`/admin/courses/${c.courseId}`} className="hover:underline">{c.title}</Link>
                      </span>
                      <span className="shrink-0 text-text-secondary">{c.enrollments} enrolled</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Saved reports" description="Save a date range as a CSV export you can re-run or schedule." />
        <CardContent>
          <SavedReportsPanel reports={savedReports} />
        </CardContent>
      </Card>
    </>
  );
}

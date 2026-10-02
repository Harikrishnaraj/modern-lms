import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ClipboardCheck, SearchX } from "lucide-react";
import { ResetAttemptButton } from "@/components/admin/reset-attempt-button";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ATTEMPTS_PAGE_SIZE,
  getAdminAssessmentAnalytics,
  getAdminQuestionAnalytics,
  parseAttemptQuery,
  searchAdminAttempts,
  type AttemptQuery,
} from "@/features/admin/assessments";
import { getAdminCourses } from "@/features/admin/courses";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessments" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function href(q: AttemptQuery, over: Partial<AttemptQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.q) params.set("q", m.q);
  if (m.courseId) params.set("courseId", m.courseId);
  if (m.status) params.set("status", m.status);
  if (m.page > 1) params.set("page", String(m.page));
  const qs = params.toString();
  return qs ? `/admin/assessments?${qs}` : "/admin/assessments";
}

export default async function AdminAssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseAttemptQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Assessments" />
        <PermissionDeniedState title="You cannot view assessments" description="Ask an administrator if you need access." />
      </>
    );
  }

  const canManage = await can(supabase, user.id, "assessments.manage");
  const [assessments, questions, { attempts, total }, allCourses] = await Promise.all([
    getAdminAssessmentAnalytics(supabase, query.courseId),
    getAdminQuestionAnalytics(supabase, query.courseId),
    searchAdminAttempts(supabase, query),
    getAdminCourses(supabase),
  ]);
  const flagged = questions.filter((q) => q.qualityFlag !== null);
  const pages = Math.max(1, Math.ceil(total / ATTEMPTS_PAGE_SIZE));
  const filtered = query.q !== "" || query.status !== "" || query.courseId !== "";

  return (
    <>
      <PageHeader title="Assessments" description="Averages, question-quality flags and attempt investigation across every course." />

      <Card className="mb-6">
        <CardHeader title="Assessment averages" description={query.courseId ? "Filtered to one course below." : "Across every published course."} />
        <CardContent>
          {assessments.length === 0 ? (
            <p className="text-sm text-text-secondary">No assessments with attempts yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                  <tr>
                    <th scope="col" className="p-3">Assessment</th>
                    <th scope="col" className="p-3">Course</th>
                    <th scope="col" className="p-3">Attempts</th>
                    <th scope="col" className="p-3">Learners</th>
                    <th scope="col" className="p-3">Pass rate</th>
                    <th scope="col" className="p-3">Avg score</th>
                    <th scope="col" className="p-3">Avg attempts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {assessments.map((a) => (
                    <tr key={a.assessmentId}>
                      <td className="p-3 font-medium">{a.assessmentTitle}</td>
                      <td className="p-3">{a.courseTitle}</td>
                      <td className="p-3">{a.totalAttempts}</td>
                      <td className="p-3">{a.totalLearners}</td>
                      <td className="p-3">{a.passRate}%</td>
                      <td className="p-3">{a.avgScore}%</td>
                      <td className="p-3">{a.avgAttempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Question-quality flags"
          description="Questions with 5+ attempts where everyone fails or everyone passes, which may signal a broken or trivial question."
        />
        <CardContent>
          {flagged.length === 0 ? (
            <p className="text-sm text-text-secondary">No flagged questions right now.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {flagged.map((q) => (
                <li key={q.questionId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{q.prompt}</p>
                    <p className="text-xs text-text-secondary">
                      {q.assessmentTitle} &middot; {q.courseTitle} &middot; {q.totalAttempts} attempts &middot; {q.passRate}% pass rate
                    </p>
                  </div>
                  <Badge tone={q.qualityFlag === "review_too_hard" ? "danger" : "warning"}>
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {q.qualityFlag === "review_too_hard" ? "Everyone fails" : "Everyone passes"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text">Attempt investigation</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {total.toLocaleString("en-US")} {total === 1 ? "attempt" : "attempts"}
        </p>
      </div>

      <form method="get" action="/admin/assessments" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search attempts" type="search" name="q" defaultValue={query.q} maxLength={100} hint="Learner name or email" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={query.status} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">Any status</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
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

      {attempts.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No attempts match"
            description="Try a different search, status or course."
            action={
              <Link href="/admin/assessments" className={buttonClasses({ variant: "secondary" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState icon={ClipboardCheck} title="No attempts yet" description="Attempts will appear here as learners take assessments." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">Learner</th>
                  <th scope="col" className="p-3">Assessment</th>
                  <th scope="col" className="p-3">Attempt</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">Score</th>
                  <th scope="col" className="p-3">Started</th>
                  {canManage && <th scope="col" className="p-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {attempts.map((a) => (
                  <tr key={a.attemptId}>
                    <td className="p-3">
                      <p className="font-medium">{a.learnerName ?? a.learnerEmail ?? "Unknown"}</p>
                      {a.learnerName && <p className="text-xs text-text-secondary">{a.learnerEmail}</p>}
                    </td>
                    <td className="p-3">
                      <p>{a.assessmentTitle}</p>
                      <p className="text-xs text-text-secondary">{a.courseTitle}</p>
                    </td>
                    <td className="p-3">#{a.attemptNumber}</td>
                    <td className="p-3">
                      <StatusBadge kind="attempt" status={a.status} />
                    </td>
                    <td className="p-3">{a.percent === null ? "—" : `${a.percent}%`}</td>
                    <td className="p-3">{dateFormat.format(new Date(a.startedAt))}</td>
                    {canManage && (
                      <td className="p-3">
                        <ResetAttemptButton attemptId={a.attemptId} />
                      </td>
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

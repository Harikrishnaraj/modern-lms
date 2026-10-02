import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { filterQueue, getGradingQueue, parseAssignmentFilter, parseQueueFilter, type QueueFilter } from "@/features/assignments/grading";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Grading" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const TABS: { id: QueueFilter; label: string }[] = [
  { id: "pending", label: "To grade" },
  { id: "graded", label: "Graded" },
  { id: "all", label: "All" },
];

export default async function GradingQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = parseQueueFilter(sp.filter);
  const assignment = parseAssignmentFilter(sp.assignment);
  const all = await getGradingQueue(await createClient());
  const scoped = assignment ? all.filter((r) => r.assignmentId === assignment) : all;
  const rows = filterQueue(all, filter, assignment);
  const pending = scoped.filter((r) => r.status !== "graded").length;
  const scopedTitle = assignment ? (scoped[0]?.assignmentTitle ?? "This assignment") : null;
  const tabHref = (id: QueueFilter) => {
    const q = new URLSearchParams();
    if (assignment) q.set("assignment", assignment);
    if (id !== "pending") q.set("filter", id);
    const s = q.toString();
    return s ? `/instructor/grading?${s}` : "/instructor/grading";
  };

  return (
    <>
      <PageHeader title="Grading" description={`${pending} ${pending === 1 ? "submission" : "submissions"} waiting for a grade.`} />
      {scopedTitle && (
        <p className="mb-3 text-sm text-text-secondary">
          Showing submissions for <span className="font-medium text-text">{scopedTitle}</span>.{" "}
          <Link href={filter === "pending" ? "/instructor/grading" : `/instructor/grading?filter=${filter}`} className="text-primary underline">
            Show every assignment
          </Link>
        </p>
      )}
      <nav aria-label="Filter submissions" className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={t.id === filter ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", t.id === filter ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filter === "pending" ? "Nothing to grade" : "No submissions here"}
          description={filter === "pending" ? "New submissions from your learners will show up here." : "Try another tab."}
        />
      ) : (
        <ul aria-label="Submissions" className="space-y-2">
          {rows.map((r) => (
            <li key={r.submissionId} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  <Link href={`/instructor/grading/${r.submissionId}`} className="hover:underline">
                    {r.assignmentTitle}
                  </Link>
                  <span className="font-normal text-text-secondary"> · {r.learnerName}</span>
                </p>
                <p className="text-xs text-text-secondary">
                  {r.courseTitle} · submitted {dateTime.format(new Date(r.submittedAt))} UTC
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.isLate && <Badge tone="warning">Late</Badge>}
                {r.status === "graded" ? (
                  <Badge tone="success" dot>
                    Graded {r.grade}/{r.maxPoints}
                  </Badge>
                ) : (
                  <Badge tone="info" dot>
                    To grade
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

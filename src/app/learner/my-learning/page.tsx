import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Bookmark, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getMyLearning,
  getSavedCourses,
  splitLearning,
  type LearningItem,
} from "@/features/my-learning/queries";
import { getMyAssignedLearning } from "@/features/my-learning/assigned";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { formatDuration, formatPrice } from "@/lib/utils/format";

const dueDateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export const metadata: Metadata = { title: "My Learning" };

const TABS = [
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "saved", label: "Saved" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function LearningCard({ item }: { item: LearningItem }) {
  const done = item.status === "completed";
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link href={`/courses/${item.slug}`} className="hover:underline">
              {item.title}
            </Link>
          </h3>
          {item.subtitle && <p className="text-sm text-text-secondary">{item.subtitle}</p>}
        </div>
        {done && (
          <Badge tone="success" dot>
            Completed
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        <Progress value={item.percent} label={`Progress in ${item.title}`} />
        <p className="text-xs text-text-secondary">
          {item.completedLessons} of {item.totalLessons} lessons · {item.percent}%
        </p>
      </div>
      <div>
        <Link
          href={`/learner/courses/${item.slug}`}
          className={buttonClasses({ variant: done ? "secondary" : "primary", size: "sm" })}
        >
          {done ? "Review course" : item.completedLessons > 0 ? "Resume" : "Start learning"}
        </Link>
      </div>
    </Card>
  );
}

export default async function MyLearningPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === rawTab)?.id ?? "in-progress";

  const supabase = await createClient();
  const [items, saved, assigned] = await Promise.all([getMyLearning(supabase), getSavedCourses(supabase), getMyAssignedLearning(supabase)]);
  const { inProgress, completed } = splitLearning(items);
  const pendingAssigned = assigned.filter((a) => !a.isComplete);
  const counts: Record<TabId, number> = {
    "in-progress": inProgress.length,
    completed: completed.length,
    saved: saved.length,
  };

  return (
    <>
      <PageHeader title="My Learning" description="Your enrolled, completed and saved courses." />

      {pendingAssigned.length > 0 && (
        <section aria-labelledby="assigned-heading" className="mb-6 space-y-2 rounded-card border border-border p-4">
          <h2 id="assigned-heading" className="text-sm font-semibold">
            Assigned to you
          </h2>
          <ul className="space-y-1.5">
            {pendingAssigned.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={a.href} className="hover:underline">
                  {a.title}
                </Link>
                {a.dueAt && (
                  <span className={cn("text-xs", a.isOverdue ? "font-medium text-danger-text" : "text-text-secondary")}>
                    {a.isOverdue ? "Overdue" : "Due"} {dueDateFormat.format(new Date(a.dueAt))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="My Learning sections" className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={
              t.id === "in-progress" ? "/learner/my-learning" : `/learner/my-learning?tab=${t.id}`
            }
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              t.id === tab
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {t.label} <span className="text-text-muted">({counts[t.id]})</span>
          </Link>
        ))}
      </nav>

      {tab === "in-progress" &&
        (inProgress.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="You are not learning anything yet"
            description="Enroll in a course and it will show up here so you can pick up where you left off."
            action={
              <Link href="/courses" className={buttonClasses()}>
                Browse courses
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {inProgress.map((i) => (
              <li key={i.enrollmentId}>
                <LearningCard item={i} />
              </li>
            ))}
          </ul>
        ))}

      {tab === "completed" &&
        (completed.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No completed courses yet"
            description="Finish a course and it will be listed here, along with your certificate."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {completed.map((i) => (
              <li key={i.enrollmentId}>
                <LearningCard item={i} />
              </li>
            ))}
          </ul>
        ))}

      {tab === "saved" &&
        (saved.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            description="Use Save for later on a course page to keep it here."
            action={
              <Link href="/courses" className={buttonClasses({ variant: "secondary" })}>
                Browse courses
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {saved.map((s) => (
              <li key={s.courseId}>
                <Card className="flex flex-col gap-2 p-4">
                  <h3 className="font-semibold">
                    <Link href={`/courses/${s.slug}`} className="hover:underline">
                      {s.title}
                    </Link>
                  </h3>
                  {s.subtitle && <p className="text-sm text-text-secondary">{s.subtitle}</p>}
                  <p className="text-sm text-text-secondary">
                    {formatDuration(s.durationMinutes)} · {formatPrice(s.priceCents, s.currency)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}

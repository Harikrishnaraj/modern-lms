"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AdminCourse } from "@/features/admin/courses";
import { bulkTransition } from "@/features/courses/transition-actions";
import { formatPrice } from "@/lib/utils/format";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const who = (c: AdminCourse) => c.instructorName ?? c.instructorEmail ?? "Unknown";

export function CourseTable({
  courses,
  view,
  canReview,
}: {
  courses: AdminCourse[];
  view: "table" | "grid";
  canReview: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const allSelected = courses.length > 0 && courses.every((c) => selected.has(c.courseId));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function run(action: "start_review" | "archive") {
    setBusy(true);
    setMessage(null);
    const result = await bulkTransition([...selected], action);
    setBusy(false);
    if ("error" in result) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    const failedText = result.failed.length > 0 ? ` ${result.failed.length} could not be changed: ${result.failed[0].error}` : "";
    setMessage({ tone: result.failed.length > 0 ? "error" : "ok", text: `${result.done} updated.${failedText}` });
    setSelected(new Set());
    router.refresh();
  }

  const checkbox = (c: AdminCourse) =>
    canReview ? (
      <input
        type="checkbox"
        checked={selected.has(c.courseId)}
        onChange={() => toggle(c.courseId)}
        aria-label={`Select ${c.title}`}
        className="size-4"
      />
    ) : null;

  return (
    <div className="space-y-3">
      {canReview && (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Bulk actions">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(courses.map((c) => c.courseId)))}
              className="size-4"
            />
            Select all shown
          </label>
          <span className="text-sm text-text-secondary">{selected.size} selected</span>
          <Button variant="secondary" size="sm" disabled={selected.size === 0 || busy} onClick={() => run("start_review")}>
            Start review
          </Button>
          <Button variant="secondary" size="sm" disabled={selected.size === 0 || busy} onClick={() => run("archive")}>
            Archive
          </Button>
        </div>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger-text" : "text-sm text-success-text"}
        >
          {message.text}
        </p>
      )}

      {view === "table" ? (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-border-subtle text-xs text-neutral-text uppercase">
              <tr>
                {canReview && <th scope="col" className="w-10 p-3"><span className="sr-only">Select</span></th>}
                <th scope="col" className="p-3">Course</th>
                <th scope="col" className="p-3">Instructor</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3">Learners</th>
                <th scope="col" className="p-3">Price</th>
                <th scope="col" className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {courses.map((c) => (
                <tr key={c.courseId}>
                  {canReview && <td className="p-3">{checkbox(c)}</td>}
                  <td className="p-3">
                    <Link href={`/admin/courses/${c.courseId}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <p className="text-xs text-text-secondary">
                      v{c.versionNumber}
                      {c.categoryName ? ` · ${c.categoryName}` : ""}
                    </p>
                  </td>
                  <td className="p-3">{who(c)}</td>
                  <td className="p-3"><StatusBadge kind="course" status={c.status} /></td>
                  <td className="p-3">{c.learners}</td>
                  <td className="p-3">{formatPrice(c.priceCents, c.currency)}</td>
                  <td className="p-3">{dateFormat.format(new Date(c.updatedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <li key={c.courseId}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 font-semibold">
                    <Link href={`/admin/courses/${c.courseId}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </h2>
                  {checkbox(c)}
                </div>
                <p className="text-sm text-text-secondary">{who(c)}</p>
                <div className="mt-auto flex items-center justify-between text-sm">
                  <StatusBadge kind="course" status={c.status} />
                  <span className="text-text-secondary">{c.learners} learners</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

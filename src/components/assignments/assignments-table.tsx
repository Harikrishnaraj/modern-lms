"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, MoreHorizontal, Pencil, Search } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { deleteAssignment } from "@/features/course-authoring/assignment-actions";
import { matchesSearch, OVERVIEW_STATUS_LABEL, submissionPercent, type OverviewStatus } from "@/features/assignments/hub-rules";
import { cn } from "@/lib/utils/cn";

export interface TableRow {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  dueAt: string | null;
  maxPoints: number;
  submissions: number;
  ungraded: number;
  enrolled: number;
  status: OverviewStatus;
  /** The row's version can still be edited (a draft that is not live). */
  editable: boolean;
}

const TONE: Record<OverviewStatus, BadgeTone> = { active: "success", closed: "neutral", draft: "warning", in_review: "info" };
const dueFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-primary";

/** "Existing Assignments": every assignment across the instructor's courses, searchable. */
export function AssignmentsTable({ rows }: { rows: TableRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shown = rows.filter((r) => matchesSearch(r, q));

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menu]);

  async function onDelete(r: TableRow) {
    if (!window.confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    setMenu(null);
    setBusy(r.id);
    setError(null);
    const res = await deleteAssignment(r.courseId, r.id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <section aria-labelledby="existing-heading" className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <h2 id="existing-heading" className="text-lg font-semibold">
          Existing Assignments
        </h2>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search assignments</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search assignments..."
            className="h-9 w-full rounded-input border border-border bg-surface pr-3 pl-9 text-sm"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mx-5 mb-3 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
          {error}
        </p>
      )}
      {shown.length === 0 ? (
        <p role="status" className="px-5 pb-6 text-sm text-text-secondary">
          No assignments match &ldquo;{q.trim()}&rdquo;.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-y border-border bg-background text-xs text-text-secondary uppercase">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">Title</th>
                <th scope="col" className="px-3 py-2 font-medium">Course</th>
                <th scope="col" className="px-3 py-2 font-medium">Due Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Points</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Submissions</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const pct = submissionPercent(r.submissions, r.enrolled);
                return (
                  <tr key={r.id} className={cn("border-b border-border last:border-0", busy === r.id && "opacity-50")}>
                    <th scope="row" className="px-5 py-3 font-medium">
                      {r.title}
                      {r.ungraded > 0 && <span className="block text-xs font-normal text-text-secondary">{r.ungraded} to grade</span>}
                    </th>
                    <td className="px-3 py-3">{r.courseTitle}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{r.dueAt ? `${dueFormat.format(new Date(r.dueAt))} UTC` : "No deadline"}</td>
                    <td className="px-3 py-3">{r.maxPoints}</td>
                    <td className="px-3 py-3">
                      <Badge tone={TONE[r.status]} dot>
                        {OVERVIEW_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs">
                        {r.submissions} / {r.enrolled}
                      </span>
                      <div
                        role="progressbar"
                        aria-label={`${r.title}: ${r.submissions} of ${r.enrolled} learners submitted`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-border"
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/instructor/grading?assignment=${r.id}&filter=all`} className={iconBtn} aria-label={`View submissions for ${r.title}`}>
                          <Eye className="size-4" aria-hidden="true" />
                        </Link>
                        {r.editable ? (
                          <Link href={`/instructor/courses/${r.courseId}/assignments/${r.id}`} className={iconBtn} aria-label={`Edit ${r.title}`}>
                            <Pencil className="size-4" aria-hidden="true" />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className={cn(iconBtn, "cursor-not-allowed opacity-40")}
                            aria-label={`${r.title} is locked while the course is live or in review`}
                            title="Locked while the course is live or in review. Edit it in a new draft of the course."
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        <div className="relative" ref={menu === r.id ? menuRef : undefined}>
                          <button
                            type="button"
                            className={iconBtn}
                            aria-label={`More actions for ${r.title}`}
                            aria-haspopup="menu"
                            aria-expanded={menu === r.id}
                            onClick={() => setMenu(menu === r.id ? null : r.id)}
                          >
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </button>
                          {menu === r.id && (
                            <div role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded-card border border-border bg-surface p-1 text-left shadow-lg">
                              <Link role="menuitem" href={`/instructor/courses/${r.courseId}/assignments`} className="block rounded-control px-3 py-2 text-sm hover:bg-background">
                                Open course assignments
                              </Link>
                              {r.editable && r.submissions === 0 ? (
                                <button
                                  role="menuitem"
                                  type="button"
                                  onClick={() => void onDelete(r)}
                                  className="block w-full rounded-control px-3 py-2 text-left text-sm text-danger-text hover:bg-danger-light"
                                >
                                  Delete assignment
                                </button>
                              ) : (
                                <p className="px-3 py-2 text-xs text-text-secondary">
                                  {r.submissions > 0 ? "Has submissions, so it cannot be deleted." : "Live assignments cannot be deleted."}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

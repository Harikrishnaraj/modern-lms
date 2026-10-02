"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { CourseSearchPicker } from "@/components/admin/course-search-picker";
import type { CourseOption } from "@/features/admin/assigned-learning-actions";
import { createAssignedLearningAction, deleteAssignedLearningAction } from "@/features/admin/assigned-learning-actions";
import type { OrgAssignedLearning } from "@/features/admin/assigned-learning";
import type { OrganizationMember } from "@/features/admin/organizations";
import { Button } from "@/components/ui/button";

export interface PathOption {
  id: string;
  title: string;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function AssignmentRow({ item, revalidateHref }: { item: OrgAssignedLearning; revalidateHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await deleteAssignedLearningAction(item.id, revalidateHref);
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div>
        <p className="font-medium">
          {item.title} <span className="font-normal text-text-secondary">({item.contentType})</span>
        </p>
        <p className="text-xs text-text-secondary">
          {item.targetLabel}
          {item.dueAt && ` · Due ${dateFormat.format(new Date(item.dueAt))}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-secondary">
          {item.completedCount}/{item.totalAssigned} complete
          {item.overdueCount > 0 && <span className="ml-1.5 text-danger-text">· {item.overdueCount} overdue</span>}
        </span>
        <button type="button" onClick={remove} disabled={busy} className="text-text-secondary hover:text-danger-text" aria-label={`Remove assignment: ${item.title}`}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function AssignedLearningPanel({
  orgId,
  revalidateHref,
  assignments,
  members,
  paths,
}: {
  orgId: string;
  revalidateHref: string;
  assignments: OrgAssignedLearning[];
  members: OrganizationMember[];
  paths: PathOption[];
}) {
  const router = useRouter();
  const [contentType, setContentType] = useState<"course" | "path">("course");
  const [course, setCourse] = useState<CourseOption | null>(null);
  const [pathId, setPathId] = useState("");
  const [scope, setScope] = useState<"organization" | "user">("organization");
  const [userId, setUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createAssignedLearningAction(orgId, revalidateHref, {
      scope,
      userId: scope === "user" ? userId : null,
      contentType,
      courseId: contentType === "course" ? (course?.courseId ?? null) : null,
      pathId: contentType === "path" ? pathId : null,
      dueAt: dueAt || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCourse(null);
    setPathId("");
    setUserId("");
    setDueAt("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="space-y-3 rounded-card border border-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Content
            <select value={contentType} onChange={(e) => setContentType(e.target.value as "course" | "path")} className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="course">Course</option>
              <option value="path">Learning path</option>
            </select>
          </label>
          {contentType === "course" ? (
            <div className="min-w-56 flex-1">
              <CourseSearchPicker onSelect={setCourse} selected={course} />
            </div>
          ) : (
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-medium text-text-secondary">
              Path
              <select value={pathId} onChange={(e) => setPathId(e.target.value)} className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Choose a path…</option>
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Assign to
            <select value={scope} onChange={(e) => setScope(e.target.value as "organization" | "user")} className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="organization">Whole organization</option>
              <option value="user">A specific member</option>
            </select>
          </label>
          {scope === "user" && (
            <label className="flex min-w-48 flex-col gap-1 text-xs font-medium text-text-secondary">
              Member
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Choose a member…</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName ?? m.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Due date (optional)
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Assign
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </form>

      {assignments.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing assigned yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {assignments.map((a) => (
            <AssignmentRow key={a.id} item={a} revalidateHref={revalidateHref} />
          ))}
        </ul>
      )}
    </div>
  );
}

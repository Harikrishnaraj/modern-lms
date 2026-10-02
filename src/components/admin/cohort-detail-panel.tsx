"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { LearnerSearchPicker } from "@/components/admin/learner-search-picker";
import type { CohortMember } from "@/features/admin/enrollments";
import {
  addCohortMemberAction,
  bulkEnrollCohortAction,
  removeCohortMemberAction,
  type LearnerOption,
} from "@/features/admin/enrollment-actions";
import { Button } from "@/components/ui/button";

export interface CourseOption {
  id: string;
  title: string;
}

export function CohortDetailPanel({
  cohortId,
  members,
  courses,
}: {
  cohortId: string;
  members: CohortMember[];
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [learner, setLearner] = useState<LearnerOption | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [courseId, setCourseId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ totalMembers: number; enrolled: number } | null>(null);

  async function addMember() {
    if (!learner) return;
    setAddBusy(true);
    setAddError(null);
    const res = await addCohortMemberAction(cohortId, learner.userId);
    setAddBusy(false);
    if (!res.ok) {
      setAddError(res.error);
      return;
    }
    setLearner(null);
    router.refresh();
  }

  async function removeMember(userId: string) {
    const res = await removeCohortMemberAction(cohortId, userId);
    if (res.ok) router.refresh();
  }

  async function bulkEnroll() {
    if (!courseId) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    const res = await bulkEnrollCohortAction(cohortId, courseId);
    setBulkBusy(false);
    if (!res.ok) {
      setBulkError(res.error);
      return;
    }
    setBulkResult({ totalMembers: res.totalMembers, enrolled: res.enrolled });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="bulk-heading" className="space-y-3">
        <h2 id="bulk-heading" className="text-base font-semibold">
          Bulk assign
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Course
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="min-w-56 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Choose a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" onClick={bulkEnroll} disabled={!courseId || bulkBusy}>
            {bulkBusy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Enroll every member
          </Button>
        </div>
        {bulkError && (
          <p role="alert" className="text-sm text-danger-text">
            {bulkError}
          </p>
        )}
        {bulkResult && (
          <p className="text-sm text-success-text">
            Enrolled {bulkResult.enrolled} of {bulkResult.totalMembers} members.
          </p>
        )}
      </section>

      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="text-base font-semibold">
          Members ({members.length})
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <LearnerSearchPicker onSelect={setLearner} selected={learner} />
          </div>
          <Button size="sm" onClick={addMember} disabled={!learner || addBusy}>
            {addBusy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Add to cohort
          </Button>
        </div>
        {addError && (
          <p role="alert" className="text-sm text-danger-text">
            {addError}
          </p>
        )}

        {members.length === 0 ? (
          <p className="text-sm text-text-secondary">No members yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {m.fullName ?? m.email}
                  {m.fullName && <span className="ml-1 text-text-secondary">{m.email}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => removeMember(m.userId)}
                  className="text-text-secondary hover:text-danger-text"
                  aria-label={`Remove ${m.fullName ?? m.email} from cohort`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

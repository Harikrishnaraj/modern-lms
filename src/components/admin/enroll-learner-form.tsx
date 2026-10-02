"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LearnerSearchPicker } from "@/components/admin/learner-search-picker";
import { enrollUserAction, type LearnerOption } from "@/features/admin/enrollment-actions";
import { Button } from "@/components/ui/button";

export interface CourseOption {
  id: string;
  title: string;
}

export function EnrollLearnerForm({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [learner, setLearner] = useState<LearnerOption | null>(null);
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!learner || !courseId) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const res = await enrollUserAction(learner.userId, courseId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(true);
    setLearner(null);
    setCourseId("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <p className="mb-1 text-xs font-medium text-text-secondary">Learner</p>
        <LearnerSearchPicker onSelect={setLearner} selected={learner} />
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
        Course to enroll in
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="min-w-48 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Choose a course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={!learner || !courseId || busy}>
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Enroll
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger-text">
          {error}
        </p>
      )}
      {success && <p className="w-full text-sm text-success-text">Enrolled.</p>}
    </form>
  );
}

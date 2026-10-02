"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { AdminCohort } from "@/features/admin/enrollments";
import { createCohortAction, deleteCohortAction } from "@/features/admin/enrollment-actions";
import { Button } from "@/components/ui/button";

export function CohortsPanel({ cohorts }: { cohorts: AdminCohort[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const nameId = useId();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createCohortAction(name);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await deleteCohortAction(id);
    setBusy(false);
    setConfirmingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <label htmlFor={nameId} className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
          Cohort name
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring 2026 interns"
            className="min-w-56 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Create cohort
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {cohorts.length === 0 ? (
        <p className="text-sm text-text-secondary">No cohorts yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {cohorts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/admin/enrollments/cohorts/${c.id}`} className="min-w-0 truncate font-medium hover:underline">
                {c.name}
              </Link>
              <span className="shrink-0 text-text-secondary">
                {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
              </span>
              {confirmingId === c.id ? (
                <Button size="sm" variant="secondary" onClick={() => remove(c.id)} disabled={busy}>
                  Confirm delete
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmingId(c.id)} disabled={busy}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  <span className="sr-only"> Delete {c.name}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

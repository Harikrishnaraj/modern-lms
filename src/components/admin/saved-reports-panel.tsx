"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2 } from "lucide-react";
import { createSavedReportAction, deleteSavedReportAction, runReportNowAction } from "@/features/admin/report-actions";
import type { SavedReport } from "@/features/admin/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function ReportRow({ report }: { report: SavedReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy("run");
    setError(null);
    const res = await runReportNowAction(report.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const res = await deleteSavedReportAction(report.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{report.name}</p>
          <p className="text-xs text-text-secondary">
            Last {report.rangeDays} days &middot; {report.schedule === "none" ? "Manual only" : `Auto-runs ${report.schedule}`}
            {report.nextRunAt && ` · next ${dateFormat.format(new Date(report.nextRunAt))}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={run} disabled={busy !== null}>
            {busy === "run" ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" /> : <Download className="mr-1.5 size-3.5" aria-hidden="true" />}
            Run now
          </Button>
          <button
            type="button"
            aria-label={`Delete ${report.name}`}
            disabled={busy !== null}
            onClick={remove}
            className="inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  );
}

export function SavedReportsPanel({ reports }: { reports: SavedReport[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rangeDays, setRangeDays] = useState("30");
  const [schedule, setSchedule] = useState("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim() === "") return;
    setBusy(true);
    setError(null);
    const res = await createSavedReportAction({ name, rangeDays: Number(rangeDays), schedule });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input label="Report name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} disabled={busy} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Range
          <select value={rangeDays} onChange={(e) => setRangeDays(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Schedule
          <select value={schedule} onChange={(e) => setSchedule(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="none">Manual only</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={create} disabled={busy || name.trim() === ""}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Save report
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {reports.length === 0 ? (
        <p className="text-sm text-text-secondary">No saved reports yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { dismissReportAction, moderateContentAction } from "@/features/admin/moderation-actions";
import { setUserStatus } from "@/features/admin/user-actions";
import type { ReportKind } from "@/features/admin/moderation";
import { Button } from "@/components/ui/button";

export function ModerationRowActions({
  reportId,
  kind,
  targetId,
  hidden,
  authorId,
}: {
  reportId: string;
  kind: ReportKind;
  targetId: string;
  hidden: boolean;
  authorId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingBan, setConfirmingBan] = useState(false);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError(null);
    const res = await fn();
    setBusy(null);
    setConfirmingBan(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => run("hide", () => moderateContentAction(reportId, kind, targetId, !hidden))}
        >
          {busy === "hide" && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          {hidden ? "Restore" : "Hide"}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("dismiss", () => dismissReportAction(reportId, kind))}>
          {busy === "dismiss" && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Dismiss
        </Button>
        {confirmingBan ? (
          <>
            <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={() => run("ban", () => setUserStatus(authorId, "suspended"))}>
              {busy === "ban" && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
              Confirm ban
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirmingBan(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirmingBan(true)}>
            Ban author
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

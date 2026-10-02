"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resetAttemptAction } from "@/features/admin/assessment-actions";
import { Button } from "@/components/ui/button";

export function ResetAttemptButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    const res = await resetAttemptAction(attemptId);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="destructive" onClick={reset} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Confirm reset
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Reset attempt
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteResourceAction, deleteScormPackageAction } from "@/features/admin/content-actions";
import { Button } from "@/components/ui/button";

export function DeleteContentButton({ kind, id, label }: { kind: "resource" | "scorm"; id: string; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = kind === "resource" ? await deleteResourceAction(id) : await deleteScormPackageAction(id);
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
          <Button type="button" size="sm" variant="destructive" onClick={remove} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Confirm delete
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span className="sr-only"> Delete {label}</span>
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

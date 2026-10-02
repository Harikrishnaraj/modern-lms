"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { revokeCertificateAction } from "@/features/admin/certificate-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RevokeCertificateButton({ certificateId }: { certificateId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    const res = await revokeCertificateAction(certificateId, reason);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Revoke
      </Button>
    );
  }

  return (
    <div className="min-w-56 space-y-1.5">
      <Input label="Reason for revoking" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      <div className="flex items-center gap-1.5">
        <Button type="button" size="sm" variant="destructive" onClick={revoke} disabled={busy || reason.trim() === ""}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Confirm revoke
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

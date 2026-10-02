"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { reissueCertificateAction } from "@/features/admin/certificate-actions";
import { Button } from "@/components/ui/button";

export function ReissueCertificateButton({ certificateId }: { certificateId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  async function reissue() {
    setBusy(true);
    setError(null);
    const res = await reissueCertificateAction(certificateId);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewCode(res.code);
    router.refresh();
  }

  if (newCode) {
    return <p className="text-xs text-success-text">Reissued as {newCode}.</p>;
  }

  return (
    <div>
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={reissue} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Confirm reissue
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Reissue
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

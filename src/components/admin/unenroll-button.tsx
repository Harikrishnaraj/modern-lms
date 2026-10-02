"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { unenrollUserAction } from "@/features/admin/enrollment-actions";
import { Button } from "@/components/ui/button";

export function UnenrollButton({ userId, courseId }: { userId: string; courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unenroll() {
    setBusy(true);
    setError(null);
    const res = await unenrollUserAction(userId, courseId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button type="button" size="sm" variant="secondary" onClick={unenroll} disabled={busy}>
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Unenroll
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

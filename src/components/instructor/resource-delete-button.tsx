"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteResource } from "@/features/instructor/resource-actions";
import { Button } from "@/components/ui/button";

export function ResourceDeleteButton({ resourceId }: { resourceId: string }) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("Delete this resource? This cannot be undone.")) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteResource(resourceId);
      if (!res.ok) setErrorMsg(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={onDelete}>
        {isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
        )}
        Delete
      </Button>
      {errorMsg && (
        <p role="alert" className="text-xs text-danger-text">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

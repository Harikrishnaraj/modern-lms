"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { cancelAccountDeletionAction, requestAccountDeletionAction } from "@/features/privacy/actions";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** F-943 (T-243): data export + account deletion, shared across every portal's own settings page. */
export function PrivacyPanel({ deletionRequestedAt }: { deletionRequestedAt: string | null }) {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("Delete your account? Your data will be permanently removed after a 30-day grace period, during which you can cancel this request.")) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await requestAccountDeletionAction();
      if (!res.ok) setErrorMsg(res.error);
      else router.refresh();
    });
  }

  function onCancel() {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await cancelAccountDeletionAction();
      if (!res.ok) setErrorMsg(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Download your data</p>
        <p className="text-sm text-text-secondary">Get a copy of your profile, enrollments, submissions, certificates and reviews as a JSON file.</p>
        <a href="/privacy/export" download className={buttonClasses({ variant: "secondary", size: "sm" })}>
          <Download className="mr-1.5 size-3.5" aria-hidden="true" />
          Download my data
        </a>
      </div>

      <div className="space-y-2 border-t border-border-subtle pt-4">
        <p className="text-sm font-medium">Delete account</p>
        {deletionRequestedAt ? (
          <>
            <p className="text-sm text-text-secondary">
              Your account is scheduled for deletion on {dateFormat.format(new Date(new Date(deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000))}. You can cancel this
              any time before then.
            </p>
            <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={onCancel}>
              {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
              Cancel deletion request
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">Permanently deletes your account and data, 30 days after you request it.</p>
            <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={onDelete}>
              {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
              Delete my account
            </Button>
          </>
        )}
      </div>

      {errorMsg && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}

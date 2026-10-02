"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { PAYOUT_METHODS, PAYOUT_REFERENCE_MAX, type PayoutMethod } from "@/features/instructor/settings";
import { updatePayoutDetailsAction } from "@/features/instructor/settings-actions";
import { Button } from "@/components/ui/button";

export function PayoutDetailsForm({
  initialMethod,
  initialReference,
}: {
  initialMethod: PayoutMethod | null;
  initialReference: string;
}) {
  const [method, setMethod] = useState<PayoutMethod | "">(initialMethod ?? "");
  const [reference, setReference] = useState(initialReference);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const methodId = useId();
  const referenceId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!method) return;
    setErrorMsg(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updatePayoutDetailsAction({ method, reference });
      if (!res.ok) setErrorMsg(res.error);
      else setSaved(true);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-text-secondary">
        Payouts are not processed yet — this is stored as a reference for when they launch. Do not enter full
        bank account or card numbers here.
      </p>

      <div>
        <label htmlFor={methodId} className="text-sm font-medium text-text">
          Payout method
        </label>
        <select
          id={methodId}
          value={method}
          onChange={(e) => setMethod(e.target.value as PayoutMethod)}
          className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Choose a method…</option>
          {PAYOUT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={referenceId} className="text-sm font-medium text-text">
          Payout reference
        </label>
        <p className="text-xs text-text-secondary">e.g. your PayPal email, or a note for your payout provider account.</p>
        <input
          id={referenceId}
          type="text"
          maxLength={PAYOUT_REFERENCE_MAX}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {errorMsg && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMsg}
        </p>
      )}
      {saved && !errorMsg && <p className="text-sm text-success-text">Payout details saved.</p>}

      <Button type="submit" size="sm" disabled={isPending || !method}>
        {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Save payout details
      </Button>
    </form>
  );
}

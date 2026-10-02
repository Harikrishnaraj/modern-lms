"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { InstructorApplication } from "@/features/instructor/application";
import { applyToTeachAction } from "@/features/instructor/application-actions";
import { APPLICATION_MESSAGE_MAX } from "@/features/instructor/application";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ApplyToTeach({ application }: { application: InstructorApplication | null }) {
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const messageId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      const res = await applyToTeachAction({ message });
      if (!res.ok) setErrorMsg(res.error);
      else setSubmitted(true);
    });
  };

  if (submitted || application?.status === "pending") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Badge tone="info">Pending review</Badge>
        <span className="text-text-secondary">We&apos;ll let you know once a reviewer has looked at your application.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {application?.status === "rejected" && (
        <div className="rounded-control border border-border bg-surface-subtle p-3 text-sm">
          <p className="font-medium">Your last application was not approved.</p>
          {application.reviewNote && <p className="mt-1 text-text-secondary">{application.reviewNote}</p>}
          <p className="mt-1 text-text-secondary">You are welcome to apply again below.</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor={messageId} className="text-sm font-medium text-text">
            Why would you like to teach on Modern LMS?
          </label>
          <textarea
            id={messageId}
            rows={4}
            maxLength={APPLICATION_MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your experience and what you'd like to teach."
            className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {errorMsg && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMsg}
          </p>
        )}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Apply to teach
        </Button>
      </form>
    </div>
  );
}

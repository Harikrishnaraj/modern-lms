"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompleteResult } from "@/features/player/progress";

/** "Mark complete" for an enrolled learner; on success moves on to the next lesson if any. */
export function LessonControls({
  completed,
  nextHref,
  onComplete,
  automatic = false,
}: {
  completed: boolean;
  nextHref: string | null;
  onComplete: () => Promise<CompleteResult>;
  /** SCORM: only the package's own passed/completed report completes the lesson. */
  automatic?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ certificate: boolean } | null>(null);

  if (finished) {
    return (
      <div role="status" className="space-y-2 rounded-card border border-success bg-success-light p-4">
        <p className="inline-flex items-center gap-2 font-semibold text-success-text">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          You completed this course!
        </p>
        {finished.certificate && (
          <p className="text-sm">
            Your certificate is ready.{" "}
            <Link href="/learner/certificates" className="font-semibold underline">
              View certificates
            </Link>
          </p>
        )}
      </div>
    );
  }

  if (completed) {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-success-text">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Lesson completed
      </p>
    );
  }

  if (automatic) {
    return <p className="text-sm text-text-secondary">This lesson is marked complete when you finish the course content above.</p>;
  }

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const result = await onComplete();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.courseCompleted && !nextHref) {
        setFinished({ certificate: result.certificateCode !== null });
        router.refresh();
        return;
      }
      if (nextHref) router.push(nextHref);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button loading={pending} onClick={handleClick}>
        {nextHref ? "Mark complete and continue" : "Mark complete"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

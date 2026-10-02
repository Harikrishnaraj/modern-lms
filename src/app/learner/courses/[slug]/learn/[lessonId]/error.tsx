"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function LessonError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <ErrorState
      reference={error.digest}
        title="We could not load this lesson"
        description="Something went wrong on our side. Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}

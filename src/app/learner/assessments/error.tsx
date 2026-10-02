"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function AssessmentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      reference={error.digest}
      title="We could not load your assessments"
      description="Something went wrong on our side. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function QuestionBankError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      reference={error.digest}
      title="We could not load your question bank"
      description="Your questions are safe. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

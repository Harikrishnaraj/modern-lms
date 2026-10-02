"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function InstructorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      reference={error.digest}
      title="Something went wrong"
      description="We could not load this page. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

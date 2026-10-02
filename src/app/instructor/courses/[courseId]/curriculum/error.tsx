"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function CurriculumError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      reference={error.digest}
      title="We could not load the curriculum"
      description="Your changes are saved. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

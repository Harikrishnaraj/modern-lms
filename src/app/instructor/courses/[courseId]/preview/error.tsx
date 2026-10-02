"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function PreviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      reference={error.digest}
      title="We could not load the preview"
      description="Your course is unchanged. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

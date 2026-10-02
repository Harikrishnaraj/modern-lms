"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function CertificatesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      reference={error.digest}
      title="We could not load your certificates"
      description="Something went wrong on our side. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

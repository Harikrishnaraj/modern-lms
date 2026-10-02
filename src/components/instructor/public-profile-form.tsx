"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { HEADLINE_MAX, BIO_MAX } from "@/features/instructor/settings";
import { updatePublicProfileAction } from "@/features/instructor/settings-actions";
import { Button } from "@/components/ui/button";

export function PublicProfileForm({ initialHeadline, initialBio }: { initialHeadline: string; initialBio: string }) {
  const [headline, setHeadline] = useState(initialHeadline);
  const [bio, setBio] = useState(initialBio);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const headlineId = useId();
  const bioId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updatePublicProfileAction({ headline, bio });
      if (!res.ok) setErrorMsg(res.error);
      else setSaved(true);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={headlineId} className="text-sm font-medium text-text">
          Headline
        </label>
        <p className="text-xs text-text-secondary">Shown under your name on your published courses.</p>
        <input
          id={headlineId}
          type="text"
          maxLength={HEADLINE_MAX}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Senior Cloud Architect"
          className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor={bioId} className="text-sm font-medium text-text">
          Bio
        </label>
        <p className="text-xs text-text-secondary">A longer introduction shown on your published courses.</p>
        <textarea
          id={bioId}
          rows={4}
          maxLength={BIO_MAX}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell learners about your background and teaching style."
          className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {errorMsg && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMsg}
        </p>
      )}
      {saved && !errorMsg && <p className="text-sm text-success-text">Public profile saved.</p>}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Save public profile
      </Button>
    </form>
  );
}

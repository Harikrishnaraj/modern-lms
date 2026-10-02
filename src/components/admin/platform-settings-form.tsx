"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { updatePlatformSettingsAction } from "@/features/admin/settings-actions";
import { PORTAL_NAMES } from "@/features/admin/settings";
import type { PlatformSettings } from "@/services/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const [minPasswordLength, setMinPasswordLength] = useState(String(settings.minPasswordLength));
  const [mfaPortals, setMfaPortals] = useState<string[]>(settings.mfaRequiredPortals);
  const [idleTimeout, setIdleTimeout] = useState(settings.sessionIdleTimeoutMinutes === null ? "" : String(settings.sessionIdleTimeoutMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function togglePortal(portal: string) {
    setMfaPortals((prev) => (prev.includes(portal) ? prev.filter((p) => p !== portal) : [...prev, portal]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await updatePlatformSettingsAction({
      minPasswordLength: Number(minPasswordLength),
      mfaRequiredPortals: mfaPortals,
      sessionIdleTimeoutMinutes: idleTimeout.trim() === "" ? null : Number(idleTimeout),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-4">
      <Input
        label="Minimum password length"
        type="number"
        min={8}
        max={128}
        value={minPasswordLength}
        onChange={(e) => setMinPasswordLength(e.target.value)}
        disabled={busy}
        hint="Applies to signup, password reset and profile password changes. Admin-created accounts always require at least 12."
      />

      <fieldset className="space-y-1.5" disabled={busy}>
        <legend className="text-sm font-medium">Require a second factor (MFA) to sign in to:</legend>
        {PORTAL_NAMES.map((portal) => (
          <label key={portal} className="flex items-center gap-2 text-sm capitalize">
            <input type="checkbox" className="size-4 accent-primary" checked={mfaPortals.includes(portal)} onChange={() => togglePortal(portal)} />
            {portal}
          </label>
        ))}
      </fieldset>

      <Input
        label="Session idle timeout (minutes)"
        type="number"
        min={5}
        max={10080}
        placeholder="Never"
        value={idleTimeout}
        onChange={(e) => setIdleTimeout(e.target.value)}
        disabled={busy}
        hint="Leave blank for no idle timeout. Signs a learner/instructor/admin out after this many minutes of inactivity."
      />

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Save settings
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Saved.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

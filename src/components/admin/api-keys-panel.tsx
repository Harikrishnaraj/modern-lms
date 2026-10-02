"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createApiKeyAction, revokeApiKeyAction } from "@/features/admin/integration-actions";
import type { ApiKeySummary } from "@/features/admin/integrations";
import { API_SCOPES } from "@/services/apikeys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function ApiKeysPanel({ keys }: { keys: ApiKeySummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  function toggleScope(scope: string) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function create() {
    if (name.trim() === "" || scopes.length === 0) return;
    setBusy("create");
    setError(null);
    setNewKey(null);
    const res = await createApiKeyAction({ name, scopes });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewKey(res.plaintext);
    setName("");
    setScopes([]);
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    const res = await revokeApiKeyAction(id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {newKey && (
        <div className="rounded-card border border-success bg-success-light p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Key created — copy it now, it will not be shown again
          </p>
          <code className="mt-1 block break-all rounded-control bg-surface p-2 text-xs">{newKey}</code>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input label="Key name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} disabled={busy !== null} />
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm" disabled={busy !== null}>
          <legend className="sr-only">Scopes</legend>
          {API_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4 accent-primary" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
              {scope}
            </label>
          ))}
        </fieldset>
        <Button type="button" variant="secondary" onClick={create} disabled={busy !== null || name.trim() === "" || scopes.length === 0}>
          {busy === "create" && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Create key
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {keys.length === 0 ? (
        <p className="text-sm text-text-secondary">No API keys yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {k.name} <code className="text-xs text-text-secondary">{k.keyPrefix}…</code>
                </p>
                <p className="text-xs text-text-secondary">
                  {k.scopes.join(", ")} &middot; created {dateFormat.format(new Date(k.createdAt))}
                  {k.lastUsedAt && ` · last used ${dateFormat.format(new Date(k.lastUsedAt))}`}
                </p>
              </div>
              {k.revokedAt ? (
                <Badge tone="danger">Revoked</Badge>
              ) : (
                <Button type="button" size="sm" variant="secondary" onClick={() => revoke(k.id)} disabled={busy !== null}>
                  {busy === k.id && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

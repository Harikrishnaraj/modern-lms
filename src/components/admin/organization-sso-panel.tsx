"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SsoDomain } from "@/features/organizations/sso";
import { addSsoDomainAction, removeSsoDomainAction } from "@/features/organizations/sso-actions";

/** Organization SSO (T-165): Google Workspace domains whose members join this organization on sign-in. */
export function OrganizationSsoPanel({ orgId, domains }: { orgId: string; domains: SsoDomain[] }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    const res = await addSsoDomainAction(orgId, domain);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDomain("");
    router.refresh();
  }

  async function onRemove(d: SsoDomain) {
    if (!window.confirm(`Unlink ${d.domain}? Existing members stay; new Google sign-ins from it will no longer join this organization.`)) return;
    setBusy(d.id);
    setError(null);
    const res = await removeSsoDomainAction(d.id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <section aria-labelledby="sso-heading" className="space-y-3">
      <h2 id="sso-heading" className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="size-4" aria-hidden="true" />
        Single sign-on
      </h2>
      <p className="max-w-2xl text-sm text-text-secondary">
        People who sign in with a Google Workspace account on a linked domain join this organization automatically. Personal Google accounts never match,
        even with a company email address, and people already in another organization are not moved.
      </p>
      {error && (
        <p role="alert" className="rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
          {error}
        </p>
      )}
      {domains.length === 0 ? (
        <p className="text-sm text-text-secondary">No domains linked yet.</p>
      ) : (
        <ul aria-label="Linked Google Workspace domains" className="max-w-xl divide-y divide-border rounded-card border border-border bg-surface">
          {domains.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium">{d.domain}</span>
                <span className="ml-2 text-text-secondary">Google Workspace</span>
              </span>
              <button
                type="button"
                onClick={() => void onRemove(d)}
                disabled={busy !== null}
                aria-label={`Unlink ${d.domain}`}
                className="inline-flex size-7 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-danger-text"
              >
                {busy === d.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} aria-label="Link a Google Workspace domain" className="flex max-w-xl flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Input label="Google Workspace domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} maxLength={253} disabled={busy !== null} />
        </div>
        <Button type="submit" loading={busy === "add"} disabled={busy !== null && busy !== "add"}>
          Link domain
        </Button>
      </form>
    </section>
  );
}

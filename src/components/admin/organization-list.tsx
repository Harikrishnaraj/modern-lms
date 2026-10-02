"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AdminOrganization } from "@/features/admin/organizations";
import { ORG_NAME_MAX } from "@/features/admin/organizations";
import { createOrganizationAction } from "@/features/admin/organization-actions";
import { Button } from "@/components/ui/button";

export function OrganizationList({ organizations }: { organizations: AdminOrganization[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const slugId = useId();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createOrganizationAction({ name, slug });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/admin/organizations/${res.id}`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary" htmlFor={nameId}>
          Name
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ORG_NAME_MAX}
            placeholder="Acme Corp"
            className="min-w-48 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary" htmlFor={slugId}>
          Slug
          <input
            id={slugId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="acme-corp"
            className="min-w-32 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Create organization
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {organizations.length === 0 ? (
        <p className="text-sm text-text-secondary">No organizations yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-card border border-border">
          {organizations.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/organizations/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-surface-subtle">
                <span>
                  <span className="font-medium">{o.name}</span>
                  <span className="ml-2 text-text-secondary">{o.slug}</span>
                </span>
                <span className="text-text-secondary">
                  {o.memberCount} {o.memberCount === 1 ? "member" : "members"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

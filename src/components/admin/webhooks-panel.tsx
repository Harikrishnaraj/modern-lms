"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createWebhookAction, deleteWebhookAction } from "@/features/admin/integration-actions";
import type { WebhookEndpointSummary } from "@/features/admin/integrations";
import { WEBHOOK_EVENTS } from "@/services/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function WebhooksPanel({ endpoints }: { endpoints: WebhookEndpointSummary[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  function toggleEvent(event: string) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function create() {
    if (url.trim() === "" || events.length === 0) return;
    setBusy("create");
    setError(null);
    setNewSecret(null);
    const res = await createWebhookAction({ url, events });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewSecret(res.secret);
    setUrl("");
    setEvents([]);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    const res = await deleteWebhookAction(id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {newSecret && (
        <div className="rounded-card border border-success bg-success-light p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Webhook created — copy the signing secret now, it will not be shown again
          </p>
          <code className="mt-1 block break-all rounded-control bg-surface p-2 text-xs">{newSecret}</code>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Input label="Endpoint URL" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy !== null} />
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm" disabled={busy !== null}>
          <legend className="sr-only">Events</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4 accent-primary" checked={events.includes(event)} onChange={() => toggleEvent(event)} />
              {event}
            </label>
          ))}
        </fieldset>
        <Button type="button" variant="secondary" onClick={create} disabled={busy !== null || url.trim() === "" || events.length === 0}>
          {busy === "create" && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Add webhook
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {endpoints.length === 0 ? (
        <p className="text-sm text-text-secondary">No webhooks yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {endpoints.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium break-all">{w.url}</p>
                <p className="text-xs text-text-secondary">
                  {w.events.join(", ")} &middot; added {dateFormat.format(new Date(w.createdAt))}
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => remove(w.id)} disabled={busy !== null}>
                {busy === w.id && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

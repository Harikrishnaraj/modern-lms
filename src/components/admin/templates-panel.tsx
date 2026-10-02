"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTemplateAction, deleteTemplateAction, updateTemplateAction } from "@/features/admin/communication-actions";
import type { AnnouncementTemplate } from "@/features/admin/communication";

function TemplateForm({
  initial,
  onDone,
}: {
  initial?: AnnouncementTemplate;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = initial
      ? await updateTemplateAction(initial.id, { name, subject, body })
      : await createTemplateAction({ name, subject, body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-card border border-border bg-background p-4">
      <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required />
      <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Body
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={5000}
          required
          className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim() || !subject.trim() || !body.trim()}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          {initial ? "Save" : "Create"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}

export function TemplatesPanel({ templates }: { templates: AnnouncementTemplate[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setDeletingId(id);
    await deleteTemplateAction(id);
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {templates.length === 0 && !adding && <p className="text-sm text-text-secondary">No templates yet.</p>}

      <ul className="space-y-2">
        {templates.map((t) =>
          editingId === t.id ? (
            <li key={t.id}>
              <TemplateForm initial={t} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{t.name}</p>
                <p className="truncate text-xs text-text-secondary">{t.subject}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(t.id)} aria-label={`Edit ${t.name}`}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(t.id)}
                  disabled={deletingId === t.id}
                  aria-label={`Delete ${t.name}`}
                >
                  {deletingId === t.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <TemplateForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
          New template
        </Button>
      )}
    </div>
  );
}

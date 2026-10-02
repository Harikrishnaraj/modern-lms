"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { AdminCategory } from "@/features/admin/categories";
import { CATEGORY_NAME_MAX } from "@/features/admin/categories";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/features/admin/category-actions";
import { Button } from "@/components/ui/button";

function CategoryRow({ category }: { category: AdminCategory }) {
  const router = useRouter();
  const [slug, setSlug] = useState(category.slug);
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateCategoryAction(category.id, { slug, name });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteCategoryAction(category.id);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={CATEGORY_NAME_MAX}
          aria-label={`Name for ${category.name}`}
          className="min-w-40 flex-1 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-label={`Slug for ${category.name}`}
          className="min-w-32 flex-1 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs text-text-secondary">
          {category.courseCount} {category.courseCount === 1 ? "course" : "courses"}
        </span>
        <Button size="sm" variant="secondary" onClick={save} disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Save
        </Button>
        {confirming ? (
          <Button size="sm" variant="secondary" onClick={remove} disabled={busy}>
            Confirm delete
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)} disabled={busy || category.courseCount > 0}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span className="sr-only"> Delete {category.name}</span>
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  );
}

export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugId = useId();
  const nameId = useId();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createCategoryAction({ slug, name });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSlug("");
    setName("");
    router.refresh();
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
            maxLength={CATEGORY_NAME_MAX}
            placeholder="Photography"
            className="min-w-40 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary" htmlFor={slugId}>
          Slug
          <input
            id={slugId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="photography"
            className="min-w-32 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Add category
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <p className="text-sm text-text-secondary">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

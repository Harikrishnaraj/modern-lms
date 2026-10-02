import type { SupabaseClient } from "@supabase/supabase-js";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CATEGORY_NAME_MAX = 100;

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  courseCount: number;
}

export function validateCategorySlug(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a slug." };
  const value = input.trim().toLowerCase();
  if (value === "") return { ok: false, error: "Enter a slug." };
  if (!SLUG.test(value)) return { ok: false, error: "Use lowercase letters, numbers and hyphens only." };
  return { ok: true, value };
}

export function validateCategoryName(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a name." };
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter a name." };
  if (value.length > CATEGORY_NAME_MAX) return { ok: false, error: `Keep the name under ${CATEGORY_NAME_MAX} characters.` };
  return { ok: true, value };
}

interface Row {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

/** Every category with how many courses currently reference it, ordered for display. */
export async function getCategoriesForManagement(supabase: SupabaseClient): Promise<AdminCategory[]> {
  const [{ data: rows, error }, { data: courseCategories, error: countError }] = await Promise.all([
    supabase.from("categories").select("id, slug, name, sort_order").order("sort_order").order("name"),
    supabase.from("courses").select("category_id"),
  ]);
  if (error) throw new Error(`getCategoriesForManagement failed: ${error.message}`);
  if (countError) throw new Error(`getCategoriesForManagement failed: ${countError.message}`);

  const counts = new Map<string, number>();
  for (const c of courseCategories ?? []) {
    const id = c.category_id as string | null;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return ((rows ?? []) as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    sortOrder: r.sort_order,
    courseCount: counts.get(r.id) ?? 0,
  }));
}

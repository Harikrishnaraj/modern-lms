"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { validateCategoryName, validateCategorySlug } from "./categories";

export type CategoryActionResult = { ok: true } | { ok: false; error: string };

export async function createCategoryAction(input: { slug: string; name: string }): Promise<CategoryActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const slug = validateCategorySlug(input.slug);
  if (!slug.ok) return slug;
  const name = validateCategoryName(input.name);
  if (!name.ok) return name;

  const { data, error } = await supabase
    .from("categories")
    .insert({ slug: slug.value, name: name.value, sort_order: 0 })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "A category with that slug already exists." };
    return { ok: false, error: "We could not create that category. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "category.created",
    resourceType: "category",
    resourceId: data.id as string,
    metadata: { slug: slug.value, name: name.value },
  });

  revalidatePath("/admin/courses/categories");
  return { ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  input: { slug: string; name: string },
): Promise<CategoryActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const slug = validateCategorySlug(input.slug);
  if (!slug.ok) return slug;
  const name = validateCategoryName(input.name);
  if (!name.ok) return name;

  const { error } = await supabase.from("categories").update({ slug: slug.value, name: name.value }).eq("id", categoryId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "A category with that slug already exists." };
    return { ok: false, error: "We could not save that category. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "category.updated",
    resourceType: "category",
    resourceId: categoryId,
    metadata: { slug: slug.value, name: name.value },
  });

  revalidatePath("/admin/courses/categories");
  return { ok: true };
}

export async function deleteCategoryAction(categoryId: string): Promise<CategoryActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) {
    if (error.code === "23503") return { ok: false, error: "This category is used by at least one course. Move those courses first." };
    return { ok: false, error: "We could not delete that category. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "category.deleted",
    resourceType: "category",
    resourceId: categoryId,
  });

  revalidatePath("/admin/courses/categories");
  return { ok: true };
}

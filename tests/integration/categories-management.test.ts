import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/features/admin/category-actions";
import { getCategoriesForManagement } from "@/features/admin/categories";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-405: Categories management (T-134), live Supabase.
describe.skipIf(!hasLiveProject)("categories management (T-134, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cat");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const categoryIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    learner = await user("lrn", "learner");
  }, 200_000);

  afterAll(async () => {
    await svc.from("categories").delete().in("id", categoryIds);
    await cleanup(svc, { learnerIds: [], courseIds, userIds });
  }, 120_000);

  it("lets an admin create, rename and re-slug a category", async () => {
    currentClient = admin.client;
    const created = await createCategoryAction({ slug: `${tag}-cat-a`, name: `${tag} Category A` });
    expect(created).toEqual({ ok: true });

    const list = await getCategoriesForManagement(admin.client);
    const found = list.find((c) => c.slug === `${tag}-cat-a`);
    expect(found).toMatchObject({ name: `${tag} Category A`, courseCount: 0 });
    categoryIds.push(found!.id);

    const updated = await updateCategoryAction(found!.id, { slug: `${tag}-cat-a2`, name: `${tag} Category A Renamed` });
    expect(updated).toEqual({ ok: true });

    const listAfter = await getCategoriesForManagement(admin.client);
    expect(listAfter.find((c) => c.id === found!.id)).toMatchObject({ slug: `${tag}-cat-a2`, name: `${tag} Category A Renamed` });
  });

  it("rejects an invalid slug or an empty name", async () => {
    currentClient = admin.client;
    expect((await createCategoryAction({ slug: "Not Valid!", name: `${tag} X` })).ok).toBe(false);
    expect((await createCategoryAction({ slug: `${tag}-valid`, name: "" })).ok).toBe(false);
  });

  it("rejects a duplicate slug", async () => {
    currentClient = admin.client;
    const first = await createCategoryAction({ slug: `${tag}-dupe`, name: `${tag} Dupe` });
    expect(first).toEqual({ ok: true });
    const list = await getCategoriesForManagement(admin.client);
    categoryIds.push(list.find((c) => c.slug === `${tag}-dupe`)!.id);

    const second = await createCategoryAction({ slug: `${tag}-dupe`, name: `${tag} Dupe Again` });
    expect(second.ok).toBe(false);
  });

  it("rejects category management from a non-admin", async () => {
    currentClient = learner.client;
    const res = await createCategoryAction({ slug: `${tag}-blocked`, name: `${tag} Blocked` });
    expect(res.ok).toBe(false);
  });

  it("blocks deleting a category that a course still uses, and allows it once unused", async () => {
    currentClient = admin.client;
    await createCategoryAction({ slug: `${tag}-inuse`, name: `${tag} In Use` });
    const list = await getCategoriesForManagement(admin.client);
    const inUse = list.find((c) => c.slug === `${tag}-inuse`)!;
    categoryIds.push(inUse.id);

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      categoryId: inUse.id,
    });
    courseIds.push(course.courseId);

    const blocked = await deleteCategoryAction(inUse.id);
    expect(blocked.ok).toBe(false);

    await svc.from("courses").update({ category_id: null }).eq("id", course.courseId);
    const allowed = await deleteCategoryAction(inUse.id);
    expect(allowed).toEqual({ ok: true });
    categoryIds.splice(categoryIds.indexOf(inUse.id), 1);
  });
});

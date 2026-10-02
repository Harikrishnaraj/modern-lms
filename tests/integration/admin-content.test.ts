import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteResourceAction, deleteScormPackageAction } from "@/features/admin/content-actions";
import { getAdminResources, getAdminScormPackages } from "@/features/admin/content";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-410: Admin content oversight (T-138), live Supabase.
describe.skipIf(!hasLiveProject)("admin content oversight (T-138, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("acnt");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let plainLearner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let resourceId: string;
  let scormLessonId: string;
  let scormPackageId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    plainLearner = await user("plain", "learner");

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: resource } = await svc
      .from("resource_library_items")
      .insert({ owner_id: instructor.id, name: `${tag}-handout.pdf`, storage_path: `${tag}/handout.pdf`, mime_type: "application/pdf", size_bytes: 1024 })
      .select("id")
      .single();
    resourceId = resource!.id;

    const { data: section } = await svc
      .from("course_sections")
      .insert({ version_id: course.versionId, title: `${tag} Section 2` })
      .select("id")
      .single();
    const { data: lesson } = await svc
      .from("lessons")
      .insert({ section_id: section!.id, title: `${tag} SCORM Lesson`, type: "scorm" })
      .select("id")
      .single();
    scormLessonId = lesson!.id;

    const { data: pkg } = await svc
      .from("scorm_packages")
      .insert({
        lesson_id: scormLessonId,
        version: "1.2",
        title: `${tag} Package`,
        launch_path: "index.html",
        storage_prefix: `${tag}/pkg`,
        file_paths: ["index.html", "imsmanifest.xml"],
        file_count: 2,
        total_bytes: 500,
        uploaded_by: instructor.id,
      })
      .select("id")
      .single();
    scormPackageId = pkg!.id;
  }, 200_000);

  afterAll(async () => {
    await svc.from("resource_library_items").delete().eq("id", resourceId);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("finds the resource and the SCORM package platform-wide, by name", async () => {
    currentClient = admin.client;
    const resources = await getAdminResources(admin.client, `${tag}-handout`, 1);
    expect(resources.resources.some((r) => r.resourceId === resourceId)).toBe(true);

    const packages = await getAdminScormPackages(admin.client, `${tag} SCORM Lesson`, 1);
    expect(packages.packages.some((p) => p.packageId === scormPackageId)).toBe(true);
    expect(packages.packages.find((p) => p.packageId === scormPackageId)).toMatchObject({ version: "1.2", fileCount: 2 });
  });

  it("rejects listing for a non-admin", async () => {
    await expect(getAdminResources(plainLearner.client, "", 1)).rejects.toThrow();
    await expect(getAdminScormPackages(plainLearner.client, "", 1)).rejects.toThrow();
  });

  it("rejects deletes from a non-admin", async () => {
    currentClient = plainLearner.client;
    expect((await deleteResourceAction(resourceId)).ok).toBe(false);
    expect((await deleteScormPackageAction(scormPackageId)).ok).toBe(false);
  });

  it("deletes the resource (audited) and the SCORM package (audited)", async () => {
    currentClient = admin.client;
    const resDel = await deleteResourceAction(resourceId);
    expect(resDel).toEqual({ ok: true });
    const { data: goneResource } = await svc.from("resource_library_items").select("id").eq("id", resourceId).maybeSingle();
    expect(goneResource).toBeNull();

    const pkgDel = await deleteScormPackageAction(scormPackageId);
    expect(pkgDel).toEqual({ ok: true });
    const { data: gonePackage } = await svc.from("scorm_packages").select("id").eq("id", scormPackageId).maybeSingle();
    expect(gonePackage).toBeNull();

    const { data: auditRows } = await svc
      .from("audit_logs")
      .select("action, resource_id")
      .in("action", ["content.resource_deleted", "content.scorm_package_deleted"])
      .in("resource_id", [resourceId, scormPackageId]);
    expect(auditRows).toHaveLength(2);
  });
});

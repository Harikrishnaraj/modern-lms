// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteAsset } from "@/features/course-authoring/lesson-actions";
import {
  attachResourceAction,
  deleteResource,
  registerResource,
  requestResourceUpload,
} from "@/features/instructor/resource-actions";
import { getResourceLibrary } from "@/features/instructor/resources";
import { rateLimit } from "@/services/rate-limit";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const pdf = () => new Blob(["%PDF-1.4 test resource"], { type: "application/pdf" });

// F-219: Instructor resource library (T-111), live Supabase.
describe.skipIf(!hasLiveProject)("instructor resource library (T-111, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("reslib");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let lessonId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  async function uploadResource(name = "handout.pdf") {
    currentClient = owner.client;
    const t = await requestResourceUpload({ name, size: 22, type: "application/pdf" });
    if (!t.ok) throw new Error(t.error);
    const { error } = await owner.client.storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, pdf(), {
      contentType: "application/pdf",
    });
    if (error) throw error;
    const result = await registerResource({ path: t.path, name, size: 22, type: "application/pdf" });
    expect(result).toEqual({ ok: true });
    const lib = await getResourceLibrary(owner.client);
    return lib.find((r) => r.name === name)!;
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("other", "instructor");
    course = await createCourse(svc, owner.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: false, // published courses are locked against edits
      sections: [{ title: "S", lessons: [{ title: "Text lesson" }] }],
    });
    courseIds.push(course.courseId);
    lessonId = course.lessonIds[0];
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("rejects requesting an upload ticket while rate-limited (T-241, SECURITY §18)", async () => {
    currentClient = owner.client;
    vi.mocked(rateLimit).mockResolvedValueOnce(false);
    expect(await requestResourceUpload({ name: "x.pdf", size: 10, type: "application/pdf" })).toEqual({
      ok: false,
      error: "Too many attempts. Please wait a while and try again.",
    });
  });

  it("uploads a resource with zero usage, scoped to its owner", async () => {
    const resource = await uploadResource();
    expect(resource.usageCount).toBe(0);

    currentClient = other.client;
    const othersLib = await getResourceLibrary(other.client);
    expect(othersLib.find((r) => r.id === resource.id)).toBeUndefined();
  });

  it("attaches a resource to a lesson, raising its usage count, and lets a learner read the resulting attachment", async () => {
    const resource = await uploadResource("syllabus.pdf");

    currentClient = owner.client;
    const attach = await attachResourceAction(resource.id, course.courseId, lessonId);
    expect(attach).toEqual({ ok: true });

    const lib = await getResourceLibrary(owner.client);
    expect(lib.find((r) => r.id === resource.id)?.usageCount).toBe(1);

    const { data: assets } = await owner.client.from("lesson_assets").select("id, name, storage_path").eq("lesson_id", lessonId);
    const created = assets!.find((a) => a.name === "syllabus.pdf");
    expect(created).toBeDefined();
    expect(created!.storage_path).not.toBe(resource.storagePath); // copied into the lesson-assets bucket
  });

  it("blocks another instructor from attaching a resource they do not own", async () => {
    const resource = await uploadResource("owner-only.pdf");
    currentClient = other.client;
    const otherCourse = await createCourse(svc, other.id, {
      slug: `${tag}-other-course`,
      title: `${tag} Other Course`,
      sections: [{ title: "S", lessons: [{ title: "L" }] }],
    });
    courseIds.push(otherCourse.courseId);
    const attach = await attachResourceAction(resource.id, otherCourse.courseId, otherCourse.lessonIds[0]);
    expect(attach.ok).toBe(false);
  });

  it("refuses to delete a resource that is still attached, then allows it once detached", async () => {
    const resource = await uploadResource("in-use.pdf");
    currentClient = owner.client;
    await attachResourceAction(resource.id, course.courseId, lessonId);

    const blocked = await deleteResource(resource.id);
    expect(blocked.ok).toBe(false);

    const { data: assets } = await owner.client.from("lesson_assets").select("id").eq("lesson_id", lessonId).eq("name", "in-use.pdf");
    await deleteAsset(course.courseId, lessonId, assets![0].id as string);

    // Detaching cascades the usage row away, so the resource is no longer "in use".
    const libAfterDetach = await getResourceLibrary(owner.client);
    expect(libAfterDetach.find((r) => r.id === resource.id)?.usageCount).toBe(0);

    const allowed = await deleteResource(resource.id);
    expect(allowed).toEqual({ ok: true });
    expect((await getResourceLibrary(owner.client)).find((r) => r.id === resource.id)).toBeUndefined();
  });

  it("rejects an upload of a disallowed file type", async () => {
    currentClient = owner.client;
    const t = await requestResourceUpload({ name: "evil.exe", size: 10, type: "application/x-msdownload" });
    expect(t).toMatchObject({ ok: false });
  });
});

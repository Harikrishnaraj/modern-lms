"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { validateUpload } from "@/features/course-authoring/uploads";
import { attachLibraryResource } from "@/features/course-authoring/lesson-actions";
import { getAttachableLessons, type AttachableLesson } from "@/features/instructor/resources";
import { createClient } from "@/lib/supabase/server";
import { RESOURCE_LIBRARY_BUCKET, supabaseStorage } from "@/services/storage";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";

export type ResourceResult = { ok: true } | { ok: false; error: string };
export type ResourceUploadTicket =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Issues a one-time direct-to-storage upload ticket for a new library resource. */
export async function requestResourceUpload(file: {
  name: string;
  size: number;
  type: string;
}): Promise<ResourceUploadTicket> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("upload-initiate", await clientIp(), userId))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const check = validateUpload("asset", file);
  if (!check.ok) return check;

  const path = `${userId}/${randomUUID()}.${check.ext}`;
  try {
    const { token } = await supabaseStorage.createSignedUpload(RESOURCE_LIBRARY_BUCKET, path);
    return { ok: true, bucket: RESOURCE_LIBRARY_BUCKET, path, token };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/** After the browser finished uploading: verify the object exists and record it in the library. */
export async function registerResource(file: {
  path: string;
  name: string;
  size: number;
  type: string;
}): Promise<ResourceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const check = validateUpload("asset", file);
  if (!check.ok) return check;

  // The path must be one this instructor was issued (their own prefix), never an arbitrary object.
  if (typeof file.path !== "string" || !file.path.startsWith(`${user.id}/`) || file.path.includes("..")) {
    return { ok: false, error: "That upload does not belong to you." };
  }
  if (!(await supabaseStorage.exists(RESOURCE_LIBRARY_BUCKET, file.path).catch(() => false))) {
    return { ok: false, error: "The upload did not complete. Please try again." };
  }

  const { error } = await supabase.from("resource_library_items").insert({
    owner_id: user.id,
    name: check.safeName,
    storage_path: file.path,
    mime_type: check.type,
    size_bytes: file.size,
  });
  if (error) return { ok: false, error: "We could not save that resource. Please try again." };

  revalidatePath("/instructor/resources");
  return { ok: true };
}

/** Removing a resource that is still attached to a lesson would break that lesson's attachment. */
export async function deleteResource(resourceId: string): Promise<ResourceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data: resource } = await supabase
    .from("resource_library_items")
    .select("storage_path")
    .eq("id", resourceId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!resource) return { ok: false, error: "That resource is not available." };

  const { count } = await supabase
    .from("resource_library_usages")
    .select("id", { count: "exact", head: true })
    .eq("resource_id", resourceId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "This resource is attached to a lesson. Remove it from every lesson first." };
  }

  const { error } = await supabase.from("resource_library_items").delete().eq("id", resourceId);
  if (error) return { ok: false, error: "We could not delete that resource. Please try again." };

  await supabaseStorage.remove(RESOURCE_LIBRARY_BUCKET, [resource.storage_path]).catch(() => {});
  revalidatePath("/instructor/resources");
  return { ok: true };
}

/** Lessons of one of the caller's own courses, for the "attach to lesson" picker. */
export async function listAttachableLessonsAction(courseId: string): Promise<AttachableLesson[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getAttachableLessons(supabase, user.id, courseId);
}

export async function attachResourceAction(
  resourceId: string,
  courseId: string,
  lessonId: string,
): Promise<ResourceResult> {
  return attachLibraryResource(courseId, lessonId, resourceId);
}

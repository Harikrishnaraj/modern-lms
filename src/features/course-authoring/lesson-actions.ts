"use server";

import { assetStillReferenced, videoStillReferenced } from "./shared-files";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sanitizeLessonHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import {
  ASSET_BUCKET,
  RESOURCE_LIBRARY_BUCKET,
  SCORM_BUCKET,
  SCORM_STAGING_BUCKET,
  VIDEO_BUCKET,
  supabaseStorage,
} from "@/services/storage";
import { MAX_TOTAL_BYTES, ScormValidationError, validateAndExtractPackage } from "@/services/scorm/parse";
import { getCourseForEditing } from "./queries";
import { getLessonForEditing } from "./lessons";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import {
  looksLikeVideo,
  normalizeVideoRef,
  storageVideoPath,
  validateUpload,
  type MediaKind,
} from "./uploads";

export type LessonResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };
export type UploadTicket =
  | { ok: true; bucket: string; path: string; token: string; ref: string }
  | { ok: false; error: string };

const DENIED = { ok: false, error: "This lesson is not available." } as const;
const LOCKED = { ok: false, error: "This course is locked while it is in review or published." } as const;
const FAILED = { ok: false, error: "We could not save that change. Please try again." } as const;
const MAX_ASSETS = 10;
const MAX_CONTENT_CHARS = 200_000;

const saveSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200, "Keep the title under 200 characters."),
  content: z.string().max(MAX_CONTENT_CHARS, "The lesson text is too long."),
  durationMinutes: z.number().int("Use whole minutes.").min(0, "Duration cannot be negative.").max(1440, "Duration is at most 1440 minutes."),
  isPreview: z.boolean(),
});

type Db = Awaited<ReturnType<typeof createClient>>;
type Ctx =
  | { ok: true; supabase: Db; userId: string; courseId: string; versionId: string; lesson: NonNullable<Awaited<ReturnType<typeof getLessonForEditing>>> }
  | { ok: false; result: { ok: false; error: string } };

// authenticate -> own course -> newest version editable -> lesson belongs to that version.
async function authorize(courseId: string, lessonId: string): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, result: { ok: false, error: "Please log in again." } };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, result: DENIED };
  if (!course.editable) return { ok: false, result: LOCKED };
  const lesson = await getLessonForEditing(supabase, course.version.id, lessonId);
  if (!lesson) return { ok: false, result: DENIED };
  return { ok: true, supabase, userId: user.id, courseId: course.courseId, versionId: course.version.id, lesson };
}

const editorPath = (courseId: string, lessonId: string) => `/instructor/courses/${courseId}/lessons/${lessonId}`;

/** Saves title, rich text (sanitized here, never trusting the browser), video reference, duration, preview flag. */
export async function saveLesson(
  courseId: string,
  lessonId: string,
  input: { title: string; content: string; videoRef: string | null; durationMinutes: number; isPreview: boolean },
): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const video = normalizeVideoRef(input.videoRef, ctx.courseId);
  if (!video.ok) return { ok: false, error: video.error, fieldErrors: { videoRef: video.error } };

  // A newly attached (not previously saved) uploaded file: the browser only checked the claimed
  // name/MIME before upload (spoofable — a renamed .txt reports as video/mp4), so verify the
  // object actually exists and really is a video container before it is ever shown to a learner.
  const newVideoPath = storageVideoPath(video.value ?? "");
  if (newVideoPath && newVideoPath !== storageVideoPath(ctx.lesson.videoRef ?? "")) {
    const invalid = { ok: false as const, error: "The uploaded file is not a valid video. Please upload it again." };
    const ext = newVideoPath.split(".").pop() ?? "";
    try {
      const head = await supabaseStorage.readHeader(VIDEO_BUCKET, newVideoPath, 32);
      if (!looksLikeVideo(head, ext)) {
        await supabaseStorage.remove(VIDEO_BUCKET, [newVideoPath]).catch(() => {});
        return { ...invalid, fieldErrors: { videoRef: invalid.error } };
      }
    } catch {
      return { ...invalid, fieldErrors: { videoRef: invalid.error } };
    }
  }

  const patch = {
    title: parsed.data.title,
    content: sanitizeLessonHtml(parsed.data.content),
    video_url: ctx.lesson.type === "video" ? video.value : null,
    duration_minutes: parsed.data.durationMinutes,
    is_preview: parsed.data.isPreview,
  };
  const { data, error } = await ctx.supabase.from("lessons").update(patch).eq("id", lessonId).select("id");
  if (error || !data?.length) return FAILED;

  // The replaced/removed uploaded video is no longer referenced.
  const before = storageVideoPath(ctx.lesson.videoRef ?? "");
  const after = storageVideoPath(patch.video_url ?? "");
  if (before && before !== after && !(await videoStillReferenced(ctx.supabase, before))) {
    await supabaseStorage.remove(VIDEO_BUCKET, [before]).catch(() => {});
  }

  revalidatePath(editorPath(courseId, lessonId));
  revalidatePath(`/instructor/courses/${courseId}/curriculum`);
  return { ok: true };
}

/** Issues a one-time direct-to-storage upload ticket after validating the file description. */
export async function requestUpload(
  courseId: string,
  lessonId: string,
  kind: MediaKind,
  file: { name: string; size: number; type: string },
): Promise<UploadTicket> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return { ok: false, error: ctx.result.error };
  if (!(await rateLimit("upload-initiate", await clientIp(), ctx.userId))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  if (kind !== "video" && kind !== "asset") return { ok: false, error: "Unsupported upload." };
  if (kind === "video" && ctx.lesson.type !== "video") return { ok: false, error: "Only video lessons can have a video." };
  if (kind === "asset" && ctx.lesson.assets.length >= MAX_ASSETS) {
    return { ok: false, error: `A lesson can have at most ${MAX_ASSETS} attachments.` };
  }
  const check = validateUpload(kind, file);
  if (!check.ok) return check;

  const bucket = kind === "video" ? VIDEO_BUCKET : ASSET_BUCKET;
  const path = `${ctx.courseId}/${lessonId}/${randomUUID()}.${check.ext}`;
  try {
    const { token } = await supabaseStorage.createSignedUpload(bucket, path);
    return { ok: true, bucket, path, token, ref: kind === "video" ? `storage://${bucket}/${path}` : path };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/** After the browser finished uploading an attachment: verify the object exists and record it. */
export async function registerAsset(
  courseId: string,
  lessonId: string,
  file: { path: string; name: string; size: number; type: string },
): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;
  const check = validateUpload("asset", file);
  if (!check.ok) return check;
  // The path must be one this lesson was issued (prefix), never an arbitrary object.
  if (typeof file.path !== "string" || !file.path.startsWith(`${ctx.courseId}/${lessonId}/`) || file.path.includes("..")) {
    return { ok: false, error: "That upload does not belong to this lesson." };
  }
  if (ctx.lesson.assets.length >= MAX_ASSETS) return { ok: false, error: `A lesson can have at most ${MAX_ASSETS} attachments.` };
  if (!(await supabaseStorage.exists(ASSET_BUCKET, file.path).catch(() => false))) {
    return { ok: false, error: "The upload did not complete. Please try again." };
  }

  const { error } = await ctx.supabase.from("lesson_assets").insert({
    lesson_id: lessonId,
    name: check.safeName,
    storage_path: file.path,
    mime_type: check.type,
    size_bytes: file.size,
  });
  if (error) return FAILED;
  revalidatePath(editorPath(courseId, lessonId));
  return { ok: true };
}

export async function deleteAsset(courseId: string, lessonId: string, assetId: string): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;
  const asset = ctx.lesson.assets.find((a) => a.id === assetId);
  if (!asset) return DENIED;

  const { error } = await ctx.supabase.from("lesson_assets").delete().eq("id", assetId);
  if (error) return FAILED;
  // A newer or older version of the course may still use the same file.
  if (!(await assetStillReferenced(ctx.supabase, asset.storagePath))) {
    await supabaseStorage.remove(ASSET_BUCKET, [asset.storagePath]).catch(() => {});
  }
  revalidatePath(editorPath(courseId, lessonId));
  return { ok: true };
}

/**
 * Attaches a resource-library item (T-111) to this lesson: the storage object is copied into the
 * lesson-assets bucket (so the existing attachment/download code needs no changes) and a
 * lesson_assets row is created from it. Deleting that attachment later, through the existing
 * deleteAsset above, automatically clears the resource's usage count via a DB cascade.
 */
export async function attachLibraryResource(courseId: string, lessonId: string, resourceId: string): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;
  if (ctx.lesson.assets.length >= MAX_ASSETS) return { ok: false, error: `A lesson can have at most ${MAX_ASSETS} attachments.` };

  const { data: resource } = await ctx.supabase
    .from("resource_library_items")
    .select("name, storage_path, mime_type, size_bytes")
    .eq("id", resourceId)
    .maybeSingle();
  if (!resource) return { ok: false, error: "That resource is not available." };

  const ext = resource.storage_path.includes(".") ? resource.storage_path.split(".").pop() : "bin";
  const newPath = `${ctx.courseId}/${lessonId}/${randomUUID()}.${ext}`;
  try {
    await supabaseStorage.copy(RESOURCE_LIBRARY_BUCKET, resource.storage_path, ASSET_BUCKET, newPath);
  } catch {
    return FAILED;
  }

  const { data: inserted, error } = await ctx.supabase
    .from("lesson_assets")
    .insert({
      lesson_id: lessonId,
      name: resource.name,
      storage_path: newPath,
      mime_type: resource.mime_type,
      size_bytes: resource.size_bytes,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    await supabaseStorage.remove(ASSET_BUCKET, [newPath]).catch(() => {});
    return FAILED;
  }

  const { error: usageError } = await ctx.supabase
    .from("resource_library_usages")
    .insert({ resource_id: resourceId, lesson_asset_id: inserted.id });
  if (usageError) {
    await ctx.supabase.from("lesson_assets").delete().eq("id", inserted.id);
    await supabaseStorage.remove(ASSET_BUCKET, [newPath]).catch(() => {});
    return FAILED;
  }

  revalidatePath(editorPath(courseId, lessonId));
  revalidatePath("/instructor/resources");
  return { ok: true };
}

const MAX_SCORM_ZIP_BYTES = MAX_TOTAL_BYTES;

/** Issues a one-time upload ticket for the raw .zip into the staging bucket (server processes it next). */
export async function requestScormUpload(
  courseId: string,
  lessonId: string,
  file: { name: string; size: number; type: string },
): Promise<UploadTicket> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return { ok: false, error: ctx.result.error };
  if (!(await rateLimit("upload-initiate", await clientIp(), ctx.userId))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  if (ctx.lesson.type !== "scorm") return { ok: false, error: "Only SCORM lessons can have a package." };
  if (!file.name.toLowerCase().endsWith(".zip")) return { ok: false, error: "Upload a .zip file." };
  if (file.size <= 0 || file.size > MAX_SCORM_ZIP_BYTES) {
    return { ok: false, error: `The package must be under ${Math.round(MAX_SCORM_ZIP_BYTES / (1024 * 1024))}MB.` };
  }
  const path = `${ctx.courseId}/${lessonId}/${randomUUID()}.zip`;
  try {
    const { token } = await supabaseStorage.createSignedUpload(SCORM_STAGING_BUCKET, path);
    return { ok: true, bucket: SCORM_STAGING_BUCKET, path, token, ref: path };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/** After the browser finished staging the zip: validate, extract, and store the package. */
export async function processScormUpload(
  courseId: string,
  lessonId: string,
  stagingPath: string,
): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;
  if (ctx.lesson.type !== "scorm") return { ok: false, error: "Only SCORM lessons can have a package." };
  if (!stagingPath.startsWith(`${ctx.courseId}/${lessonId}/`) || stagingPath.includes("..")) {
    return { ok: false, error: "That upload does not belong to this lesson." };
  }
  if (!(await supabaseStorage.exists(SCORM_STAGING_BUCKET, stagingPath).catch(() => false))) {
    return { ok: false, error: "The upload did not complete. Please try again." };
  }

  let parsed: Awaited<ReturnType<typeof validateAndExtractPackage>>;
  try {
    const { bytes: zipBytes } = await supabaseStorage.download(SCORM_STAGING_BUCKET, stagingPath);
    parsed = await validateAndExtractPackage(zipBytes);
  } catch (err) {
    await supabaseStorage.remove(SCORM_STAGING_BUCKET, [stagingPath]).catch(() => {});
    return { ok: false, error: err instanceof ScormValidationError ? err.message : "That package could not be processed." };
  }

  const prefix = `${ctx.courseId}/${lessonId}/${randomUUID()}`;
  try {
    for (const file of parsed.files) {
      await supabaseStorage.upload(SCORM_BUCKET, `${prefix}/${file.path}`, file.bytes, file.contentType);
    }
  } catch {
    await supabaseStorage.remove(SCORM_STAGING_BUCKET, [stagingPath]).catch(() => {});
    return { ok: false, error: "We could not store that package. Please try again." };
  }

  const { data: previous } = await ctx.supabase.rpc("get_scorm_package_for_lesson", { p_lesson_id: lessonId });
  const { error } = await ctx.supabase.rpc("save_scorm_package", {
    p_lesson_id: lessonId,
    p_version: parsed.version,
    p_title: parsed.title,
    p_launch_path: parsed.launchPath,
    p_storage_prefix: prefix,
    p_file_paths: parsed.files.map((f) => f.path),
    p_file_count: parsed.files.length,
    p_total_bytes: parsed.totalBytes,
  });
  await supabaseStorage.remove(SCORM_STAGING_BUCKET, [stagingPath]).catch(() => {});
  if (error) {
    await supabaseStorage.remove(SCORM_BUCKET, parsed.files.map((f) => `${prefix}/${f.path}`)).catch(() => {});
    return FAILED;
  }

  const old = (previous as { storage_prefix: string; file_paths: string[] }[] | null)?.[0];
  if (old) {
    await supabaseStorage.remove(SCORM_BUCKET, old.file_paths.map((p) => `${old.storage_prefix}/${p}`)).catch(() => {});
  }

  revalidatePath(editorPath(courseId, lessonId));
  return { ok: true };
}

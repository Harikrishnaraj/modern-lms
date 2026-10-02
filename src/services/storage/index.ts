import { createAdminClient } from "@/services/supabase/admin";

/**
 * Storage adapter (ADR-014): the rest of the app depends on this interface, so the provider
 * (Supabase Storage today) can be swapped without touching feature code. Server-only: it uses
 * the service role, so callers must have authenticated and validated the request first.
 */
export interface StorageAdapter {
  /** Stores the bytes and returns a public URL (public buckets only). */
  uploadPublic(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** One-time token for the browser to upload straight to storage (bypasses the Next server). */
  createSignedUpload(bucket: string, path: string): Promise<{ path: string; token: string }>;
  /** Short-lived download URL for a private object. */
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
  /** Whether an object exists at `path` (used to verify a completed direct upload). */
  exists(bucket: string, path: string): Promise<boolean>;
  /** Copies an object, optionally into a different bucket, without a client round-trip. */
  copy(fromBucket: string, fromPath: string, toBucket: string, toPath: string): Promise<void>;
  /** Stores the bytes in a private bucket. No URL is returned; read it back with `download`. */
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Reads an object's bytes and stored content-type directly (service role) for server-side proxying. */
  download(bucket: string, path: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  /** The first `byteCount` bytes of an object, for sniffing real content (e.g. video magic bytes). */
  readHeader(bucket: string, path: string, byteCount: number): Promise<Uint8Array>;
}

export const THUMBNAIL_BUCKET = "course-thumbnails";
export const VIDEO_BUCKET = "course-videos";
export const ASSET_BUCKET = "lesson-assets";
export const SUBMISSION_BUCKET = "assignment-submissions";
export const ASSIGNMENT_RESOURCE_BUCKET = "assignment-resources";
export const AVATAR_BUCKET = "avatars";
export const RESOURCE_LIBRARY_BUCKET = "resource-library";
export const SCORM_BUCKET = "scorm-packages";
export const SCORM_STAGING_BUCKET = "scorm-uploads";
export const REPORT_EXPORT_BUCKET = "report-exports";

export const supabaseStorage: StorageAdapter = {
  async uploadPublic(bucket, path, bytes, contentType) {
    const admin = createAdminClient();
    const { error } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType,
      upsert: false,
      cacheControl: "31536000", // immutable: every upload gets a unique path
    });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    return admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  async remove(bucket, paths) {
    if (paths.length === 0) return;
    const { error } = await createAdminClient().storage.from(bucket).remove(paths);
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  },

  async createSignedUpload(bucket, path) {
    const { data, error } = await createAdminClient().storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`signed upload failed: ${error?.message}`);
    return { path: data.path, token: data.token };
  },

  async createSignedUrl(bucket, path, expiresInSeconds) {
    const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
    return data.signedUrl;
  },

  async exists(bucket, path) {
    const i = path.lastIndexOf("/");
    const { data } = await createAdminClient()
      .storage.from(bucket)
      .list(i === -1 ? "" : path.slice(0, i), { search: path.slice(i + 1), limit: 1 });
    return (data ?? []).some((o) => o.name === path.slice(i + 1));
  },

  async copy(fromBucket, fromPath, toBucket, toPath) {
    const { error } = await createAdminClient()
      .storage.from(fromBucket)
      .copy(fromPath, toPath, { destinationBucket: toBucket });
    if (error) throw new Error(`storage copy failed: ${error.message}`);
  },

  async upload(bucket, path, bytes, contentType) {
    const { error } = await createAdminClient().storage.from(bucket).upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  },

  async download(bucket, path) {
    const { data, error } = await createAdminClient().storage.from(bucket).download(path);
    if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
    return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  },

  async readHeader(bucket, path, byteCount) {
    // The storage-js `download()` helper does not expose a Range header, so we fetch the object's
    // own (short-lived, server-only) signed URL directly to read just its first bytes.
    const url = await this.createSignedUrl(bucket, path, 60);
    const res = await fetch(url, { headers: { Range: `bytes=0-${byteCount - 1}` } });
    if (!res.ok && res.status !== 206) throw new Error(`storage read failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },
};

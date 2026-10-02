import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type ScormVersion = "1.2" | "2004";

export interface ExtractedFile {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface ParsedScormPackage {
  version: ScormVersion;
  title: string | null;
  launchPath: string;
  files: ExtractedFile[];
  totalBytes: number;
}

export const MAX_PACKAGE_FILES = 3000;
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB per file
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300MB uncompressed

const ALLOWED_EXTENSIONS = new Set([
  "html", "htm", "js", "css", "json", "xml", "xsd", "dtd",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
  "mp3", "mp4", "wav", "ogg", "webm",
  "woff", "woff2", "ttf", "eot",
  "txt", "csv", "pdf",
]);

const EXT_TO_MIME: Record<string, string> = {
  html: "text/html", htm: "text/html", js: "application/javascript",
  css: "text/css", json: "application/json", xml: "application/xml",
  xsd: "application/xml", dtd: "application/xml-dtd",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", eot: "application/vnd.ms-fontobject",
  txt: "text/plain", csv: "text/csv", pdf: "application/pdf",
};

/** Content type from the (already allow-listed) extension; storage rewrites text/html to text/plain on download. */
export function contentTypeFor(path: string): string | undefined {
  return EXT_TO_MIME[extensionOf(path)];
}

export class ScormValidationError extends Error {}

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

/** Rejects zip-slip paths: absolute, drive-letter, or containing a ".." segment. */
function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.startsWith("\\") || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split(/[/\\]/);
  return segments.every((s) => s !== "..");
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function detectVersion(manifest: Record<string, unknown>): ScormVersion {
  const root = manifest.manifest as Record<string, unknown> | undefined;
  const metadata = root?.metadata as Record<string, unknown> | undefined;
  const schemaVersion = String(metadata?.schemaversion ?? "");
  if (schemaVersion.includes("2004")) return "2004";
  if (schemaVersion.includes("1.2")) return "1.2";
  const attrs = JSON.stringify(root ?? {});
  if (attrs.includes("2004")) return "2004";
  return "1.2";
}

/** Default organization's default item's resource href — the single-SCO launch file. */
function findLaunchPath(manifest: Record<string, unknown>): string | null {
  const root = manifest.manifest as Record<string, unknown> | undefined;
  if (!root) return null;

  const orgsBlock = root.organizations as Record<string, unknown> | undefined;
  const organizations = asArray(orgsBlock?.organization as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const defaultOrgId = orgsBlock?.["@_default"] as string | undefined;
  const org = organizations.find((o) => o["@_identifier"] === defaultOrgId) ?? organizations[0];
  const items = asArray(org?.item as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const item = items[0];
  const identifierRef = item?.["@_identifierref"] as string | undefined;
  if (!identifierRef) return null;

  const resourcesBlock = root.resources as Record<string, unknown> | undefined;
  const resources = asArray(resourcesBlock?.resource as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const resource = resources.find((r) => r["@_identifier"] === identifierRef);
  const href = resource?.["@_href"] as string | undefined;
  return href ?? null;
}

function findTitle(manifest: Record<string, unknown>): string | null {
  const root = manifest.manifest as Record<string, unknown> | undefined;
  const orgsBlock = root?.organizations as Record<string, unknown> | undefined;
  const organizations = asArray(orgsBlock?.organization as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const title = organizations[0]?.title;
  return typeof title === "string" && title.trim() !== "" ? title.trim() : null;
}

/**
 * Validates an uploaded SCORM package (SECURITY.md §9: file type/size/filename/path), extracts
 * every entry, and locates the default-organization launch file from imsmanifest.xml. Supports
 * a single-SCO package only — no cross-SCO sequencing/navigation.
 */
export async function validateAndExtractPackage(zipBytes: Uint8Array): Promise<ParsedScormPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new ScormValidationError("That file is not a valid zip archive.");
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length === 0) throw new ScormValidationError("The package is empty.");
  if (entries.length > MAX_PACKAGE_FILES) {
    throw new ScormValidationError(`A SCORM package can have at most ${MAX_PACKAGE_FILES} files.`);
  }

  const files: ExtractedFile[] = [];
  let totalBytes = 0;
  let manifestBytes: Uint8Array | null = null;

  for (const entry of entries) {
    const path = entry.name.replace(/^\.\//, "");
    if (!isSafeRelativePath(path)) {
      throw new ScormValidationError(`Unsafe file path in package: ${path}`);
    }
    const ext = extensionOf(path);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new ScormValidationError(`Unsupported file type in package: ${path}`);
    }

    const bytes = await entry.async("uint8array");
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new ScormValidationError(`${path} exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB per-file limit.`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new ScormValidationError(`The package exceeds the ${MAX_TOTAL_BYTES / (1024 * 1024)}MB total size limit.`);
    }

    files.push({ path, bytes, contentType: EXT_TO_MIME[ext] ?? "application/octet-stream" });
    if (path.toLowerCase() === "imsmanifest.xml") manifestBytes = bytes;
  }

  if (!manifestBytes) {
    throw new ScormValidationError("The package is missing imsmanifest.xml at its root.");
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let manifest: Record<string, unknown>;
  try {
    manifest = parser.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
  } catch {
    throw new ScormValidationError("imsmanifest.xml could not be parsed.");
  }

  const launchPath = findLaunchPath(manifest);
  if (!launchPath) {
    throw new ScormValidationError("Could not find a launch file referenced in imsmanifest.xml.");
  }
  const normalizedLaunch = launchPath.replace(/^\.\//, "");
  const matchedFile = files.find((f) => f.path === normalizedLaunch || f.path.toLowerCase() === normalizedLaunch.toLowerCase());
  if (!matchedFile) {
    throw new ScormValidationError(`The manifest's launch file "${launchPath}" is not in the package.`);
  }

  return {
    version: detectVersion(manifest),
    title: findTitle(manifest),
    launchPath: matchedFile.path,
    files,
    totalBytes,
  };
}

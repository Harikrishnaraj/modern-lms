import { NextResponse, type NextRequest } from "next/server";
import { seedCmi } from "@/services/scorm/cmi";
import { contentTypeFor } from "@/services/scorm/parse";
import { HOST_FRAME_PATH, buildHostFrame } from "@/services/scorm/host-frame";
import { buildScormShim, injectShim } from "@/services/scorm/shim";
import { verifyScormToken } from "@/services/scorm/token";
import { SCORM_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => new NextResponse("Not found", { status: 404, headers: { "referrer-policy": "no-referrer" } });
// no-referrer: the token is in the URL, so never pass it on to anything the package links to.
const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

/**
 * Serves one file of a lesson's SCORM package: /api/scorm/<lessonId>/<token>/<file path>.
 * The player iframe is sandboxed (no allow-same-origin), so its requests carry no session cookie;
 * the signed token in the path (minted after RLS granted the lesson, see services/scorm/token.ts)
 * is the credential, and every relative URL inside the package inherits it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ lessonId: string; path: string[] }> }) {
  const { lessonId, path: segments } = await params;
  if (!UUID.test(lessonId) || segments.length < 2) return NOT_FOUND();
  const tokenUser = verifyScormToken(segments[0], lessonId);
  if (!tokenUser) return NOT_FOUND();
  const userId: string = tokenUser;
  const requestedPath = segments.slice(1).join("/");

  const admin = createAdminClient();
  const { data: pkg } = await admin
    .from("scorm_packages")
    .select("version, launch_path, storage_prefix, file_paths")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!pkg) return NOT_FOUND();
  const version = pkg.version as "1.2" | "2004";

  // Fresh or resumed CMI for this learner; every API instance (host frame or injected) starts from it.
  async function shim(): Promise<string> {
    const [{ data: registration }, { data: profile }] = await Promise.all([
      admin.from("scorm_registrations").select("cmi").eq("lesson_id", lessonId).eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    const seed = seedCmi({
      version,
      learnerName: (profile?.full_name as string | null)?.trim() || "Learner",
      learnerId: userId,
      resume: Boolean(registration),
      savedCmi: (registration?.cmi as Record<string, string> | null) ?? {},
    });
    return buildScormShim({ version, seedCmi: seed });
  }

  if (requestedPath === HOST_FRAME_PATH) {
    return new NextResponse(buildHostFrame({ shim: await shim(), launchPath: pkg.launch_path as string }), { headers: HTML_HEADERS });
  }
  if (!((pkg.file_paths as string[]) ?? []).includes(requestedPath)) return NOT_FOUND();

  let file: { bytes: Uint8Array; contentType: string };
  try {
    file = await supabaseStorage.download(SCORM_BUCKET, `${pkg.storage_prefix as string}/${requestedPath}`);
  } catch {
    return NOT_FOUND();
  }
  // Storage hands text/html back as text/plain, so trust the (allow-listed) extension instead.
  const contentType = contentTypeFor(requestedPath) ?? file.contentType;

  // Every HTML document also gets the shim, for drivers that look in their own window, and for the
  // isolated fallback (no content origin) where the host frame cannot be reached. Launch files are
  // often routers that navigate to the page that loads the driver (Storyline: index_lms_html5.html).
  if (contentType.includes("html")) {
    return new NextResponse(injectShim(new TextDecoder().decode(file.bytes), await shim()), { headers: HTML_HEADERS });
  }

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

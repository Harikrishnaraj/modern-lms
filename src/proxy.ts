import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { can } from "@/lib/permissions/can";
import { needsMfa } from "@/lib/permissions/mfa";
import { LAST_ACTIVE_COOKIE, isSessionIdleExpired } from "@/lib/permissions/session";
import { getPlatformSettings } from "@/services/settings";
import { pickRequestId, REQUEST_ID_HEADER } from "@/lib/log/request-id";

// Authentication ("is there a user") + portal-level authorization ("can this
// user use this portal"). Finer-grained per-action permission checks inside
// a portal are added as those features land.
const PORTAL_PERMISSION: Record<string, string> = {
  "/learner": "portal.learner.access",
  "/instructor": "portal.instructor.access",
  "/admin": "portal.admin.access",
  "/org_admin": "portal.org_admin.access",
};

// Paths that need the session refreshed and portal access checked (the original matcher).
const SESSION_PATHS = /^\/(learner|instructor|admin|org_admin|courses|certificates)(\/|$)/;

/** Host of the dedicated SCORM content origin, when configured and distinct from the app's own. */
export function scormContentHost(contentOrigin: string | undefined, appUrl: string | undefined): string | null {
  try {
    if (!contentOrigin) return null;
    const host = new URL(contentOrigin).host;
    return appUrl && new URL(appUrl).host === host ? null : host;
  } catch {
    return null;
  }
}

/**
 * Every request gets a correlation ID (T-242): forwarded to the app as `x-request-id` (so server
 * logs carry it) and returned on the response (so a user or support can quote it).
 */
export async function proxy(request: NextRequest) {
  const requestId = pickRequestId(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const response = await route(request, requestHeaders);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

async function route(request: NextRequest, requestHeaders: Headers): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // The SCORM content origin runs untrusted package code with allow-same-origin, so it serves
  // package files only (/api/scorm, excluded by the matcher): no login page, app pages or other
  // APIs, so there is never a session on that origin for package code to use.
  const contentHost = scormContentHost(process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN, process.env.NEXT_PUBLIC_APP_URL);
  if (contentHost && request.headers.get("host") === contentHost) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!SESSION_PATHS.test(pathname)) return NextResponse.next({ request: { headers: requestHeaders } });

  const { response, user, supabase } = await updateSession(request, requestHeaders);
  const portal = Object.keys(PORTAL_PERMISSION).find((prefix) => pathname.startsWith(prefix));

  if (portal && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (portal && user) {
    const allowed = await can(supabase, user.id, PORTAL_PERMISSION[portal]);
    if (!allowed) {
      return NextResponse.redirect(new URL("/permission-denied", request.url));
    }

    // Platform policy (T-143): configurable which portals require a second factor, and whether
    // an idle session forces re-authentication. Defaults match the app's original hardcoded
    // behavior (admin-only MFA, no idle timeout) until an admin changes them.
    const settings = await getPlatformSettings(supabase);
    const portalName = portal.slice(1);

    if (settings.sessionIdleTimeoutMinutes !== null) {
      const lastActive = request.cookies.get(LAST_ACTIVE_COOKIE)?.value ?? null;
      if (isSessionIdleExpired(lastActive, settings.sessionIdleTimeoutMinutes, new Date())) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        url.searchParams.set("reason", "session-expired");
        const redirect = NextResponse.redirect(url);
        redirect.cookies.delete(LAST_ACTIVE_COOKIE);
        return redirect;
      }
      response.cookies.set(LAST_ACTIVE_COOKIE, new Date().toISOString(), {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      });
    }

    // Second factor required for this portal (F-005 originally hardcoded to admin only).
    if (settings.mfaRequiredPortals.includes(portalName) && (await needsMfa(supabase))) {
      const url = new URL("/mfa", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Everything except static assets and the SCORM file route, so the content-origin guard above
  // sees every other request; session work still only runs for SESSION_PATHS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/scorm/).*)"],
};

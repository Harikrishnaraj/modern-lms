import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseEnv } from "./env";

// Refreshes the auth session and syncs cookies onto the response. Call from
// the root proxy.ts. Returns the (possibly null) user so the caller can gate
// routes, and the client itself so a permission check (can(), T-019) can
// reuse it instead of creating a second one.
export async function updateSession(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<{ response: NextResponse; user: User | null; supabase: SupabaseClient }> {
  // `requestHeaders` (with the proxy's x-request-id) are forwarded to the app; cookie writes below
  // land on `request.cookies`, so they are re-read into the forwarded headers each time.
  const forward = () => {
    if (!requestHeaders) return NextResponse.next({ request });
    requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  let response = forward();
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}

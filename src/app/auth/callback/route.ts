import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalPathForUser } from "@/features/auth/roles";
import { parseSsoJoinResult, safeNextPath } from "@/features/organizations/sso-rules";
import { log } from "@/lib/log";

// Exchanges the code from a Supabase email link (signup verification or password recovery) or a
// Google sign-in (T-165) for a session. Google sign-ins are then matched to the organization that
// owns their Workspace domain (join_organization_via_sso). An explicit, relative `next` wins;
// otherwise the user goes to their portal.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const isSso = searchParams.get("sso") === "google";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user.identities?.some((i) => i.provider === "google")) {
        const { data: joined, error: joinError } = await supabase.rpc("join_organization_via_sso");
        const result = parseSsoJoinResult(joined);
        if (joinError) log.error("auth.sso_join_failed", { message: joinError.message, userId: data.user.id });
        else if (result === "joined" || result === "other_org") log.info("auth.sso_join", { result, userId: data.user.id });
      }
      const target = next ?? (await getPortalPathForUser(supabase, data.user.id));
      return NextResponse.redirect(`${origin}${target}`);
    }
    if (isSso) log.warn("auth.sso_exchange_failed", { message: error.message });
  }

  if (isSso) return NextResponse.redirect(`${origin}/login?error=sso_failed`);
  const errorRedirect = next === "/reset-password" ? "/forgot-password" : "/verify-email";
  return NextResponse.redirect(`${origin}${errorRedirect}?error=link_invalid`);
}

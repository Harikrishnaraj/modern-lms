"use server";

import { redirect } from "next/navigation";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit, userAgent } from "@/services/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginInput } from "./schemas";
import { getPortalPathForUser } from "./roles";
import { needsMfa } from "@/lib/permissions/mfa";
import { getPlatformSettings } from "@/services/settings";

// Only redirect to a same-origin relative path the middleware itself set
// (?next=) — never follow an attacker-supplied absolute/protocol-relative
// URL (open redirect).
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// Never trust the client: re-validate here even though LoginForm already
// validated, since a Server Action is a public endpoint callable directly.
// `next` is bound by the page from ?next= (see LoginPage), not form input.
export async function login(
  next: string | null,
  input: LoginInput,
): Promise<{ error?: string } | void> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }

  if (!(await rateLimit("login", await clientIp(), parsed.data.email))) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  // One generic message for both a wrong password and an unknown email —
  // distinguishing them would let an attacker enumerate registered emails.
  if (error) {
    return { error: "Invalid email or password." };
  }

  // Best effort: a login history hiccup must never block a successful sign-in.
  try {
    await supabase.rpc("record_login", { p_ip: await clientIp(), p_user_agent: await userAgent() });
  } catch {
    // ignore
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .single();

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    return { error: "Your account has been suspended. Contact support." };
  }

  const destination = safeNext(next) ?? (await getPortalPathForUser(supabase, data.user.id));
  // Go straight to the second-factor step (the proxy would also enforce it,
  // but a proxy redirect after a Server Action leaves the URL bar stale).
  // T-143/T-162: which portals require MFA is configurable; this must agree with src/proxy.ts.
  const portalName = destination.split("/")[1] ?? "";
  const settings = await getPlatformSettings(supabase);
  if (settings.mfaRequiredPortals.includes(portalName) && (await needsMfa(supabase))) {
    redirect(`/mfa?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

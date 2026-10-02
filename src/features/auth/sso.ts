"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { clientIp, rateLimit } from "@/services/rate-limit";
import { safeNextPath } from "@/features/organizations/sso-rules";

/**
 * The origin this request came in on (so preview deployments return to themselves). Supabase Auth
 * only honours return addresses on its redirect allowlist, so a forged Host cannot redirect away.
 */
async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const h = await headers();
  const host = h.get("host");
  if (!host) return configured;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * "Continue with Google" (T-165). Supabase Auth runs the OAuth flow (PKCE) and returns to
 * /auth/callback, which joins the user to their organization when their Google Workspace domain is
 * linked to one. Only a relative `next` is carried through.
 */
export async function signInWithGoogle(next: string | null): Promise<void> {
  if (!(await rateLimit("login", await clientIp(), "google-sso"))) redirect("/login?error=rate_limited");

  const supabase = await createClient();
  const callback = new URL("/auth/callback", await appOrigin());
  callback.searchParams.set("sso", "google");
  const safe = safeNextPath(next);
  if (safe) callback.searchParams.set("next", safe);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) {
    log.warn("auth.sso_start_failed", { provider: "google", message: error?.message });
    redirect("/login?error=sso_unavailable");
  }
  redirect(data.url);
}

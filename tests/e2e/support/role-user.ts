import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./env";
import { totp } from "./totp";

loadEnvLocal();

const PASSWORD = "e2e-role-pass-1";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

// Creates a confirmed user whose only role is `role`, logs in through the UI
// and returns a cleanup function that deletes the user.
// Back-office logins land on /mfa; by default the helper enrols an authenticator
// and completes the challenge. Pass { mfa: false } to stop at the /mfa page.
// The returned cleanup fn also carries { email, secret, login() } for re-logins.
export async function loginAsRole(page: Page, role: string, opts: { mfa?: boolean } = {}) {
  const db = admin();
  const email = `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;

  // New signups get "learner" by default (trigger); replace it.
  await db.from("user_roles").delete().eq("user_id", userId);
  const { error: roleError } = await db
    .from("user_roles")
    .insert({ user_id: userId, role_id: role });
  if (roleError) throw roleError;
  // Learner specs exercise the portal, not onboarding (onboarding.spec.ts covers that with its own user).
  if (role === "learner") await db.from("learner_onboarding").insert({ user_id: userId, interests: ["design"] });

  const state = { secret: "" };
  const login = async () => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/(learner|instructor|admin|org_admin|mfa)(\?.*)?$/);
    if (page.url().includes("/mfa") && opts.mfa !== false) {
      const secretEl = page.getByTestId("mfa-secret");
      if (await secretEl.count()) state.secret = (await secretEl.innerText()).trim();
      await page.getByLabel("Authentication code").fill(totp(state.secret));
      await page.getByRole("button", { name: "Verify" }).click();
      await page.waitForURL(/\/(admin|org_admin)$/);
    }
  };
  await login();

  return Object.assign(() => db.auth.admin.deleteUser(userId), {
    email,
    login,
    userId,
    secret: () => state.secret,
  });
}

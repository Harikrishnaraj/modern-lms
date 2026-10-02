"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/services/settings";
import { buildSignUpSchema, type SignUpInput } from "./schemas";

// Never trust the client: re-validate here even though SignUpForm already
// validated, since a Server Action is a public endpoint callable directly.
export async function signUp(input: SignUpInput): Promise<{ error?: string } | void> {
  const supabase = await createClient();
  const settings = await getPlatformSettings(supabase);
  const parsed = buildSignUpSchema(settings.minPasswordLength).safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  // With "Confirm email" on, Supabase answers an already-registered email with a normal success; with
  // it off it returns user_already_exists. Treat both the same so the form never reveals which emails
  // have accounts (no account enumeration).
  if (error && error.code !== "user_already_exists") {
    return { error: "We couldn't create your account. Please try again." };
  }

  // A new account and an already-registered email both land here — this redirect covers both.
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

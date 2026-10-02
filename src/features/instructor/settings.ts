import type { SupabaseClient } from "@supabase/supabase-js";

export const HEADLINE_MAX = 150;
export const BIO_MAX = 2000;

export const PAYOUT_METHODS = [
  { value: "paypal", label: "PayPal" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]["value"];
export const PAYOUT_REFERENCE_MAX = 200;

export interface PublicProfile {
  headline: string | null;
  bio: string | null;
}

export interface PayoutDetails {
  payoutMethod: PayoutMethod;
  payoutReference: string;
  updatedAt: string;
}

export function validateHeadline(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: true, value: null };
  const value = input.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > HEADLINE_MAX) return { ok: false, error: `Keep your headline under ${HEADLINE_MAX} characters.` };
  return { ok: true, value };
}

export function validateBio(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: true, value: null };
  const value = input.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > BIO_MAX) return { ok: false, error: `Keep your bio under ${BIO_MAX} characters.` };
  return { ok: true, value };
}

export function validatePayoutDetails(
  input: unknown,
): { ok: true; value: { method: PayoutMethod; reference: string } } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Choose a payout method." };
  const { method, reference } = input as { method?: unknown; reference?: unknown };
  if (typeof method !== "string" || !PAYOUT_METHODS.some((m) => m.value === method)) {
    return { ok: false, error: "Choose a valid payout method." };
  }
  if (typeof reference !== "string" || reference.trim() === "") {
    return { ok: false, error: "Enter a payout reference (e.g. your PayPal email)." };
  }
  const trimmed = reference.trim();
  if (trimmed.length > PAYOUT_REFERENCE_MAX) {
    return { ok: false, error: `Keep the payout reference under ${PAYOUT_REFERENCE_MAX} characters.` };
  }
  return { ok: true, value: { method: method as PayoutMethod, reference: trimmed } };
}

/** The caller's own public profile fields (headline/bio), shown on their published courses. */
export async function getPublicProfile(supabase: SupabaseClient, userId: string): Promise<PublicProfile> {
  const { data, error } = await supabase.from("profiles").select("headline, bio").eq("id", userId).maybeSingle();
  if (error) throw new Error(`getPublicProfile failed: ${error.message}`);
  return { headline: (data?.headline as string | null) ?? null, bio: (data?.bio as string | null) ?? null };
}

/** The caller's own payout details, if they have saved any yet. */
export async function getPayoutDetails(supabase: SupabaseClient, userId: string): Promise<PayoutDetails | null> {
  const { data, error } = await supabase
    .from("instructor_payout_details")
    .select("payout_method, payout_reference, updated_at")
    .eq("instructor_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getPayoutDetails failed: ${error.message}`);
  if (!data) return null;
  return {
    payoutMethod: data.payout_method as PayoutMethod,
    payoutReference: data.payout_reference as string,
    updatedAt: data.updated_at as string,
  };
}

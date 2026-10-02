"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { sniffImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { getPlatformSettings } from "@/services/settings";
import { AVATAR_BUCKET, supabaseStorage } from "@/services/storage";
import { MAX_AVATAR_BYTES, avatarPathFromUrl, validateName, validatePasswordChange } from "./rules";

export type ProfileResult = { ok: true; avatarUrl: string | null } | { ok: false; error: string };
export type PasswordResult = { ok: true } | { ok: false; error: string; fieldErrors?: { current?: string; next?: string; confirm?: string } };

/** Saves the display name and optionally replaces or removes the avatar (validated by content). */
export async function updateProfile(formData: FormData): Promise<ProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const name = validateName(formData.get("fullName"));
  if (!name.ok) return name;

  const { data: current } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  const oldUrl = (current?.avatar_url as string | null) ?? null;
  let avatarUrl = oldUrl;
  let uploadedPath: string | null = null;

  const file = formData.get("avatar");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_AVATAR_BYTES) return { ok: false, error: "The picture must be 1 MB or smaller." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return { ok: false, error: "The picture must be a PNG, JPEG or WebP image." };
    uploadedPath = `${user.id}/${randomUUID()}.${kind.ext}`;
    try {
      avatarUrl = await supabaseStorage.uploadPublic(AVATAR_BUCKET, uploadedPath, bytes, kind.mime);
    } catch {
      return { ok: false, error: "We could not upload your picture. Please try again." };
    }
  } else if (formData.get("removeAvatar") === "on") {
    avatarUrl = null;
  }

  const { error } = await supabase.from("profiles").update({ full_name: name.value, avatar_url: avatarUrl }).eq("id", user.id);
  if (error) {
    if (uploadedPath) await supabaseStorage.remove(AVATAR_BUCKET, [uploadedPath]).catch(() => undefined);
    return { ok: false, error: "We could not save your profile. Please try again." };
  }

  // The replaced picture is no longer referenced anywhere: remove it.
  const oldPath = avatarPathFromUrl(oldUrl);
  if (oldPath && oldUrl !== avatarUrl) await supabaseStorage.remove(AVATAR_BUCKET, [oldPath]).catch(() => undefined);

  revalidatePath("/learner/settings");
  revalidatePath("/instructor/settings");
  return { ok: true, avatarUrl };
}

/**
 * Changes the password after re-checking the current one on a throwaway client (a stolen session
 * alone cannot change it). Attempts are rate-limited like login.
 */
export async function changePassword(input: { current: string; next: string; confirm: string }): Promise<PasswordResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "Please log in again." };

  const settings = await getPlatformSettings(supabase);
  const parsed = validatePasswordChange(input, settings.minPasswordLength);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  if (!(await rateLimit("login", await clientIp(), `password-change:${user.email}`))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, error: "We could not change your password. Please try again." };
  const probe = createAnonClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: verifyError } = await probe.auth.signInWithPassword({ email: user.email, password: input.current });
  if (verifyError) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { current: "That is not your current password." } };

  const { error } = await supabase.auth.updateUser({ password: input.next });
  if (error) {
    const weak = error.message.toLowerCase().includes("password");
    return { ok: false, error: weak ? error.message : "We could not change your password. Please try again." };
  }
  return { ok: true };
}

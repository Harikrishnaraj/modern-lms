// Pure profile and password rules (F-116).

export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt truncates beyond 72 bytes
export const MAX_AVATAR_BYTES = 1024 * 1024;

export function validateName(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter your name." };
  const value = input.trim().replace(/\s+/g, " ");
  if (value === "") return { ok: false, error: "Enter your name." };
  if (value.length > NAME_MAX) return { ok: false, error: `Keep your name under ${NAME_MAX} characters.` };
  // No control characters (they would break emails and certificates).
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: "Your name contains characters we cannot use." };
  return { ok: true, value };
}

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

export function validatePasswordChange(
  input: PasswordChangeInput,
  minLength: number = PASSWORD_MIN,
): { ok: true } | { ok: false; errors: { current?: string; next?: string; confirm?: string } } {
  const errors: { current?: string; next?: string; confirm?: string } = {};
  if (!input.current) errors.current = "Enter your current password.";
  if (input.next.length < minLength) errors.next = `Use at least ${minLength} characters.`;
  else if (input.next.length > PASSWORD_MAX) errors.next = `Use at most ${PASSWORD_MAX} characters.`;
  else if (input.current && input.next === input.current) errors.next = "Choose a password different from your current one.";
  if (input.confirm !== input.next) errors.confirm = "The passwords do not match.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
}

/** Object path inside the avatars bucket back from a public URL, for cleanup of replaced files. */
export function avatarPathFromUrl(url: string | null, bucket = "avatars"): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

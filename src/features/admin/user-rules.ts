// Pure rules for user management (F-401, SECURITY section 3). No I/O: the server actions gather the
// facts (who is acting, the target roles, how many super admins exist) and ask these functions.

export const ROLE_IDS = [
  "learner",
  "instructor",
  "content_reviewer",
  "support_agent",
  "org_admin",
  "admin",
  "super_admin",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export const ROLE_LABEL: Record<RoleId, string> = {
  learner: "Learner",
  instructor: "Instructor",
  content_reviewer: "Content reviewer",
  support_agent: "Support agent",
  org_admin: "Org admin",
  admin: "Admin",
  super_admin: "Super admin",
};

/** Only a super admin may grant, revoke or touch these. */
export const PRIVILEGED_ROLES: readonly RoleId[] = ["admin", "super_admin"];

export const isRoleId = (v: unknown): v is RoleId => typeof v === "string" && (ROLE_IDS as readonly string[]).includes(v);
const isPrivileged = (r: string) => (PRIVILEGED_ROLES as readonly string[]).includes(r);

export const MIN_PASSWORD_LENGTH = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (e.length === 0 || e.length > 254 || !EMAIL.test(e)) return "Enter a valid email address.";
  return null;
}

/**
 * Admin-created accounts never go below MIN_PASSWORD_LENGTH even if the platform's configured
 * minimum (T-143) is lower, but a higher configured minimum still raises the bar further.
 */
export function validatePassword(password: string, configuredMinLength = MIN_PASSWORD_LENGTH): string | null {
  const floor = Math.max(configuredMinLength, MIN_PASSWORD_LENGTH);
  return password.length >= floor ? null : `Use at least ${floor} characters for the password.`;
}

/** Deduplicated known roles, or an error when empty or unknown. */
export function parseRoleSet(input: unknown): { ok: true; roles: RoleId[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Choose at least one role." };
  if (!input.every(isRoleId)) return { ok: false, error: "Unknown role." };
  return { ok: true, roles: [...new Set(input)] as RoleId[] };
}

export interface Actor {
  id: string;
  roles: string[];
}

const isSuper = (a: Actor) => a.roles.includes("super_admin");

/**
 * May `actor` change `target` from `before` roles to `next` roles? Returns an error message or null.
 * `superAdmins` is the number of ACTIVE super admins right now.
 */
export function checkRoleChange(
  actor: Actor,
  target: { id: string; roles: string[] },
  next: readonly string[],
  superAdmins: number,
): string | null {
  if (actor.id === target.id) return "You cannot change your own roles. Ask another administrator.";
  const added = next.filter((r) => !target.roles.includes(r));
  const removed = target.roles.filter((r) => !next.includes(r));
  if (added.length === 0 && removed.length === 0) return "Those are already this user's roles.";
  if (!isSuper(actor) && (target.roles.some(isPrivileged) || added.some(isPrivileged) || removed.some(isPrivileged))) {
    return "Only a super admin can change admin access.";
  }
  if (removed.includes("super_admin") && superAdmins <= 1) return "There must always be at least one super admin.";
  return null;
}

/** May `actor` suspend or reinstate `target`? */
export function checkStatusChange(
  actor: Actor,
  target: { id: string; roles: string[]; status: string },
  next: "active" | "suspended",
  superAdmins: number,
): string | null {
  if (actor.id === target.id) return "You cannot suspend your own account.";
  if (target.status === next) return next === "suspended" ? "This account is already suspended." : "This account is already active.";
  if (!isSuper(actor) && target.roles.some(isPrivileged)) return "Only a super admin can change an admin account.";
  if (next === "suspended" && target.roles.includes("super_admin") && superAdmins <= 1) {
    return "There must always be at least one active super admin.";
  }
  return null;
}

/** May `actor` give a NEW account these roles? */
export function checkNewUserRoles(actor: Actor, roles: readonly string[]): string | null {
  if (!isSuper(actor) && roles.some(isPrivileged)) return "Only a super admin can create admin accounts.";
  return null;
}

"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { getPlatformSettings } from "@/services/settings";
import { createAdminClient } from "@/services/supabase/admin";
import {
  checkNewUserRoles,
  checkRoleChange,
  checkStatusChange,
  parseRoleSet,
  validateEmail,
  validatePassword,
  type Actor,
} from "./user-rules";

export type UserActionResult = { ok: true; link?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h";

/** Signed in + user.manage, and the actor own roles for the escalation rules. */
async function authorize(): Promise<
  { ok: true; actor: Actor; email: string | null } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "user.manage"))) {
    return { ok: false, error: "You do not have permission to manage users." };
  }
  const { data } = await supabase.from("user_roles").select("role_id").eq("user_id", user.id);
  return { ok: true, actor: { id: user.id, roles: (data ?? []).map((r) => r.role_id as string) }, email: user.email ?? null };
}

async function loadTarget(admin: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("id, status").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role_id").eq("user_id", userId),
  ]);
  if (!profile) return null;
  return { id: userId, status: profile.status as string, roles: (roles ?? []).map((r) => r.role_id as string) };
}

async function countActiveSuperAdmins(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("user_roles").select("user_id, profiles!inner(status)").eq("role_id", "super_admin").eq("profiles.status", "active");
  return (data ?? []).length;
}

/** Replaces a user roles. Audited with the before and after sets. */
export async function changeUserRoles(userId: string, roles: string[]): Promise<UserActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const parsed = parseRoleSet(roles);
  if (!parsed.ok) return parsed;
  if (!UUID.test(userId)) return { ok: false, error: "User not found." };

  const admin = createAdminClient();
  const target = await loadTarget(admin, userId);
  if (!target) return { ok: false, error: "User not found." };
  const error = checkRoleChange(auth.actor, target, parsed.roles, await countActiveSuperAdmins(admin));
  if (error) return { ok: false, error };

  const { error: rpcError } = await admin.rpc("set_user_roles", { p_user_id: userId, p_roles: parsed.roles });
  if (rpcError) return { ok: false, error: "We could not change the roles. Please try again." };
  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.email,
    action: "user.role_changed",
    resourceType: "user",
    resourceId: userId,
    metadata: { before: [...target.roles].sort(), after: [...parsed.roles].sort() },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Suspends (login refused, existing sessions lose permissions, sign-in banned) or reinstates. */
export async function setUserStatus(userId: string, status: "active" | "suspended"): Promise<UserActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (status !== "active" && status !== "suspended") return { ok: false, error: "Unknown status." };
  if (!UUID.test(userId)) return { ok: false, error: "User not found." };

  const admin = createAdminClient();
  const target = await loadTarget(admin, userId);
  if (!target) return { ok: false, error: "User not found." };
  const error = checkStatusChange(auth.actor, target, status, await countActiveSuperAdmins(admin));
  if (error) return { ok: false, error };

  const { error: profileError } = await admin.from("profiles").update({ status }).eq("id", userId);
  if (profileError) return { ok: false, error: "We could not update the account. Please try again." };
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: status === "suspended" ? BAN_FOREVER : "none" });
  if (banError) {
    await admin.from("profiles").update({ status: target.status }).eq("id", userId);
    return { ok: false, error: "We could not update the account. Please try again." };
  }
  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.email,
    action: status === "suspended" ? "user.suspended" : "user.reinstated",
    resourceType: "user",
    resourceId: userId,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Creates a confirmed account with a temporary password and a role. */
export async function createUser(input: { email: string; password: string; fullName: string; role: string }): Promise<UserActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };
  const settings = await getPlatformSettings(admin);
  const passwordError = validatePassword(input.password ?? "", settings.minPasswordLength);
  if (passwordError) return { ok: false, error: passwordError };
  const roles = parseRoleSet([input.role]);
  if (!roles.ok) return roles;
  const escalation = checkNewUserRoles(auth.actor, roles.roles);
  if (escalation) return { ok: false, error: escalation };
  const email = input.email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim().slice(0, 100) },
  });
  if (error || !data.user) {
    const taken = error?.message?.toLowerCase().includes("already");
    return { ok: false, error: taken ? "An account with that email already exists." : "We could not create the account." };
  }
  const id = data.user.id;
  if (input.fullName.trim()) await admin.from("profiles").update({ full_name: input.fullName.trim().slice(0, 100) }).eq("id", id);
  const { error: rpcError } = await admin.rpc("set_user_roles", { p_user_id: id, p_roles: roles.roles });
  if (rpcError) return { ok: false, error: "The account was created but its role could not be set." };
  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.email,
    action: "user.created",
    resourceType: "user",
    resourceId: id,
    metadata: { email, roles: roles.roles },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Invites someone: creates the pending account and returns a one-time sign-up link to hand over.
 * No email is sent from here (delivery arrives with communication settings, T-141).
 */
export async function inviteUser(input: { email: string; role: string }): Promise<UserActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };
  const roles = parseRoleSet([input.role]);
  if (!roles.ok) return roles;
  const escalation = checkNewUserRoles(auth.actor, roles.roles);
  if (escalation) return { ok: false, error: escalation };

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (error || !data?.user) {
    const taken = error?.message?.toLowerCase().includes("already");
    return { ok: false, error: taken ? "An account with that email already exists." : "We could not create the invitation." };
  }
  const { error: rpcError } = await admin.rpc("set_user_roles", { p_user_id: data.user.id, p_roles: roles.roles });
  if (rpcError) return { ok: false, error: "The invitation was created but its role could not be set." };
  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.email,
    action: "user.invited",
    resourceType: "user",
    resourceId: data.user.id,
    metadata: { email, roles: roles.roles },
  });
  revalidatePath("/admin/users");
  return { ok: true, link: data.properties?.action_link };
}

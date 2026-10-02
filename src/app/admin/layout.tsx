import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/portal-shell";
import { logout } from "@/features/auth/logout";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/can";
import { needsMfa } from "@/lib/permissions/mfa";
import { getPlatformSettings } from "@/services/settings";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Modern LMS" },
};

// src/proxy.ts already redirects unauthenticated/unpermitted requests before
// this ever renders; this check is defense-in-depth (a proxy matcher change
// or a route reached another way must not silently drop the guard).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await can(supabase, user.id, "portal.admin.access"))) redirect("/permission-denied");
  // T-143: which portals require MFA is configurable; this must agree with src/proxy.ts's check.
  const settings = await getPlatformSettings(supabase);
  if (settings.mfaRequiredPortals.includes("admin") && (await needsMfa(supabase))) redirect("/mfa");

  return (
    <PortalShell portal="admin" user={user && { email: user.email! }} onLogout={logout} profileHref="/admin/profile">
      {children}
    </PortalShell>
  );
}

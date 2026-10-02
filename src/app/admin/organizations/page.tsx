import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizationList } from "@/components/admin/organization-list";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminOrganizations } from "@/features/admin/organizations";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organizations" };

export default async function AdminOrganizationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "organizations.manage"))) {
    return (
      <>
        <PageHeader title="Organizations" />
        <PermissionDeniedState title="You cannot manage organizations" description="Ask an administrator if you need access." />
      </>
    );
  }

  const { organizations } = await getAdminOrganizations(supabase, { q: "", page: 1 });

  return (
    <>
      <PageHeader title="Organizations" description="Tenants, members and scoped admins." />
      <OrganizationList organizations={organizations} />
    </>
  );
}

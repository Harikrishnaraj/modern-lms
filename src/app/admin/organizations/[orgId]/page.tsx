import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrganizationDetailPanel } from "@/components/admin/organization-detail-panel";
import { AssignedLearningPanel } from "@/components/admin/assigned-learning-panel";
import { OrganizationSsoPanel } from "@/components/admin/organization-sso-panel";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getOrgAssignedLearning } from "@/features/admin/assigned-learning";
import { getOrganizationDetail, getOrganizationMembers } from "@/features/admin/organizations";
import { listPaths } from "@/features/paths/paths";
import { getOrganizationSsoDomains } from "@/features/organizations/sso";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organization" };

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "organizations.manage"))) {
    return (
      <>
        <PageHeader title="Organization" />
        <PermissionDeniedState title="You cannot manage organizations" description="Ask an administrator if you need access." />
      </>
    );
  }

  const org = await getOrganizationDetail(supabase, orgId);
  if (!org) notFound();
  const [members, assignments, paths, ssoDomains] = await Promise.all([
    getOrganizationMembers(supabase, orgId),
    getOrgAssignedLearning(supabase, orgId),
    listPaths(supabase),
    getOrganizationSsoDomains(supabase, orgId),
  ]);
  const revalidateHref = `/admin/organizations/${orgId}`;

  return (
    <>
      <PageHeader
        title={org.name}
        description={`${org.memberCount} ${org.memberCount === 1 ? "member" : "members"}`}
        actions={
          <Link href="/admin/organizations" className="text-sm text-primary hover:underline">
            ← Back to organizations
          </Link>
        }
      />
      <div className="space-y-10">
        <OrganizationDetailPanel org={org} members={members} />
        <OrganizationSsoPanel orgId={orgId} domains={ssoDomains} />
        <section aria-labelledby="assigned-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="assigned-heading" className="text-base font-semibold">
              Assigned learning
            </h2>
            <a href={`/admin/organizations/${orgId}/report/export`} className="text-sm text-primary hover:underline">
              Export report (CSV)
            </a>
          </div>
          <AssignedLearningPanel orgId={orgId} revalidateHref={revalidateHref} assignments={assignments} members={members} paths={paths.map((p) => ({ id: p.pathId, title: p.title }))} />
        </section>
      </div>
    </>
  );
}

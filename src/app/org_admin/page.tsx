import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizationDetailPanel } from "@/components/admin/organization-detail-panel";
import { AssignedLearningPanel } from "@/components/admin/assigned-learning-panel";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getOrgAssignedLearning } from "@/features/admin/assigned-learning";
import { getMyOrganizationId, getOrganizationDetail, getOrganizationMembers } from "@/features/admin/organizations";
import { listPaths } from "@/features/paths/paths";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Organization" };

export default async function OrgAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgId = await getMyOrganizationId(supabase);
  if (!orgId) {
    return (
      <>
        <PageHeader title="My Organization" />
        <EmptyState title="Not assigned to an organization yet" description="Ask a platform administrator to add you as a member." />
      </>
    );
  }

  const org = await getOrganizationDetail(supabase, orgId);
  if (!org) {
    return (
      <>
        <PageHeader title="My Organization" />
        <EmptyState title="Organization not found" description="Ask a platform administrator to check your membership." />
      </>
    );
  }
  const [members, assignments, paths] = await Promise.all([getOrganizationMembers(supabase, orgId), getOrgAssignedLearning(supabase, orgId), listPaths(supabase)]);

  return (
    <>
      <PageHeader title={org.name} description={`${org.memberCount} ${org.memberCount === 1 ? "member" : "members"}`} />
      <div className="space-y-10">
        <OrganizationDetailPanel org={org} members={members} />
        <section aria-labelledby="assigned-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="assigned-heading" className="text-base font-semibold">
              Assigned learning
            </h2>
            <a href="/org_admin/report/export" className="text-sm text-primary hover:underline">
              Export report (CSV)
            </a>
          </div>
          <AssignedLearningPanel orgId={orgId} revalidateHref="/org_admin" assignments={assignments} members={members} paths={paths.map((p) => ({ id: p.pathId, title: p.title }))} />
        </section>
      </div>
    </>
  );
}

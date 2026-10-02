import { NextResponse, type NextRequest } from "next/server";
import { getOrgAssignedLearning, organizationReportToCsv } from "@/features/admin/assigned-learning";
import { getOrganizationDetail } from "@/features/admin/organizations";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit } from "@/services/rate-limit";

// F-503: organization report export (completion/overdue/hours), platform-admin side.
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await rateLimit("analytics-export", await clientIp(), user.id))) {
    return new NextResponse("Too many exports. Please wait a while and try again.", { status: 429 });
  }
  if (!(await can(supabase, user.id, "organizations.manage"))) return new NextResponse("Forbidden", { status: 403 });

  const org = await getOrganizationDetail(supabase, orgId);
  if (!org) return new NextResponse("Not found", { status: 404 });
  const rows = await getOrgAssignedLearning(supabase, orgId);

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.report_exported",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { exported: rows.length },
  });

  return new NextResponse(organizationReportToCsv(org.name, org.learningHours, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${org.slug}-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

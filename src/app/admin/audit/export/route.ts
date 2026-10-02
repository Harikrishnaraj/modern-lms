import { NextResponse, type NextRequest } from "next/server";
import { auditToCsv, getAuditExport, parseAuditQuery } from "@/features/admin/audit";
import { can } from "@/lib/permissions/can";
import { needsMfa } from "@/lib/permissions/mfa";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit } from "@/services/rate-limit";

// CSV export of the audit log with the same filters as the screen. Checked here as well as in the
// proxy: signed in, second factor passed, and audit.read. The export itself is audited.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await rateLimit("analytics-export", await clientIp(), user.id))) {
    return new NextResponse("Too many exports. Please wait a while and try again.", { status: 429 });
  }
  if ((await needsMfa(supabase)) || !(await can(supabase, user.id, "audit.read"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseAuditQuery(params);
  const rows = await getAuditExport(supabase, filters);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "audit.exported",
    resourceType: "audit_log",
    metadata: { rows: rows.length, filters: { ...filters, page: undefined } },
  });

  return new NextResponse(auditToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getMyDataExport } from "@/features/privacy/account";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit } from "@/services/rate-limit";

// F-943 (T-243, SECURITY.md §21): "data export where required". Portal-neutral (not under
// /learner, /instructor or /admin) since every account, regardless of role, can export its own data.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await rateLimit("analytics-export", await clientIp(), user.id))) {
    return new NextResponse("Too many exports. Please wait a while and try again.", { status: 429 });
  }

  const data = await getMyDataExport(supabase, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "account.data_exported",
    resourceType: "profile",
    resourceId: user.id,
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}

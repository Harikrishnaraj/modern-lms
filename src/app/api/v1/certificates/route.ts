import { NextResponse, type NextRequest } from "next/server";
import { API_PAGE_SIZE, parsePage } from "@/services/apikeys/pagination";
import { verifyApiRequest } from "@/services/apikeys/verify";
import { createAdminClient } from "@/services/supabase/admin";

/** Public reporting API (T-142, scope certificates:read): every certificate, any status. */
export async function GET(request: NextRequest) {
  const auth = await verifyApiRequest(request, "certificates:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const page = parsePage(request);
  const courseId = request.nextUrl.searchParams.get("courseId");
  const admin = createAdminClient();
  let query = admin
    .from("certificates")
    .select("id, code, user_id, course_id, status, issued_at, revoked_at", { count: "exact" })
    .order("issued_at", { ascending: false })
    .range((page - 1) * API_PAGE_SIZE, page * API_PAGE_SIZE - 1);
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const certificates = (data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    userId: c.user_id,
    courseId: c.course_id,
    status: c.status,
    issuedAt: c.issued_at,
    revokedAt: c.revoked_at,
  }));

  return NextResponse.json({ data: certificates, page, pageSize: API_PAGE_SIZE, total: count ?? 0 });
}

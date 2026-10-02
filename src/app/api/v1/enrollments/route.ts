import { NextResponse, type NextRequest } from "next/server";
import { API_PAGE_SIZE, parsePage } from "@/services/apikeys/pagination";
import { verifyApiRequest } from "@/services/apikeys/verify";
import { createAdminClient } from "@/services/supabase/admin";

/** Public reporting API (T-142, scope enrollments:read): every enrollment, any status. */
export async function GET(request: NextRequest) {
  const auth = await verifyApiRequest(request, "enrollments:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const page = parsePage(request);
  const courseId = request.nextUrl.searchParams.get("courseId");
  const admin = createAdminClient();
  let query = admin
    .from("enrollments")
    .select("id, user_id, course_id, status, enrolled_at, completed_at", { count: "exact" })
    .order("enrolled_at", { ascending: false })
    .range((page - 1) * API_PAGE_SIZE, page * API_PAGE_SIZE - 1);
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const enrollments = (data ?? []).map((e) => ({
    id: e.id,
    userId: e.user_id,
    courseId: e.course_id,
    status: e.status,
    enrolledAt: e.enrolled_at,
    completedAt: e.completed_at,
  }));

  return NextResponse.json({ data: enrollments, page, pageSize: API_PAGE_SIZE, total: count ?? 0 });
}

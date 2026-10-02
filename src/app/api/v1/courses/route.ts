import { NextResponse, type NextRequest } from "next/server";
import { API_PAGE_SIZE, parsePage } from "@/services/apikeys/pagination";
import { verifyApiRequest } from "@/services/apikeys/verify";
import { createAdminClient } from "@/services/supabase/admin";

/** Public reporting API (T-142, scope courses:read): published courses. */
export async function GET(request: NextRequest) {
  const auth = await verifyApiRequest(request, "courses:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const page = parsePage(request);
  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("courses")
    .select("id, slug, published_version_id, course_versions!courses_published_version_fk(title, price_cents, currency)", { count: "exact" })
    .not("published_version_id", "is", null)
    .order("id")
    .range((page - 1) * API_PAGE_SIZE, page * API_PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const courses = (data ?? []).map((c) => {
    const version = c.course_versions as unknown as { title: string; price_cents: number; currency: string } | null;
    return {
      id: c.id,
      slug: c.slug,
      title: version?.title ?? null,
      priceCents: version?.price_cents ?? null,
      currency: version?.currency ?? null,
    };
  });

  return NextResponse.json({ data: courses, page, pageSize: API_PAGE_SIZE, total: count ?? 0 });
}

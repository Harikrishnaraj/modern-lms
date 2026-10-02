import { NextResponse, type NextRequest } from "next/server";
import {
  exportToCsv,
  getInstructorExportRows,
  parseCourseFilter,
} from "@/features/instructor/analytics";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/services/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!(await rateLimit("analytics-export", await clientIp(), user.id))) {
    return new NextResponse("Too many exports. Please wait a while and try again.", { status: 429 });
  }

  const courseParam = request.nextUrl.searchParams.get("course");
  const courseId = parseCourseFilter(courseParam);

  try {
    const rows = await getInstructorExportRows(supabase, courseId);
    const csvData = exportToCsv(rows);
    const today = new Date().toISOString().slice(0, 10);
    const filename = courseId
      ? `analytics-course-${courseId}-${today}.csv`
      : `analytics-all-courses-${today}.csv`;

    return new NextResponse(csvData, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new NextResponse(
      `Error exporting analytics: ${err instanceof Error ? err.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}

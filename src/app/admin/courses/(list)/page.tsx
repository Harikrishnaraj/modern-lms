import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, SearchX } from "lucide-react";
import { CourseTable } from "@/components/admin/course-table";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ADMIN_TABS,
  countByTab,
  filterAdminCourses,
  getAdminCourses,
  parseAdminCourseQuery,
  type AdminCourseQuery,
} from "@/features/admin/courses";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Courses" };

function href(q: AdminCourseQuery, over: Partial<AdminCourseQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.tab !== "all") params.set("tab", m.tab);
  if (m.q) params.set("q", m.q);
  if (m.category) params.set("category", m.category);
  if (m.view !== "table") params.set("view", m.view);
  const qs = params.toString();
  return qs ? `/admin/courses?${qs}` : "/admin/courses";
}

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseAdminCourseQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Courses" />
        <PermissionDeniedState title="You cannot view courses" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [all, canReview] = await Promise.all([getAdminCourses(supabase), can(supabase, user.id, "course.review")]);
  const counts = countByTab(all);
  const shown = filterAdminCourses(all, query);
  const categories = [...new Map(all.filter((c) => c.categorySlug).map((c) => [c.categorySlug!, c.categoryName!])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  return (
    <>
      <PageHeader
        title="Courses"
        description="Review, publish and manage every course on the platform."
        actions={
          <div className="inline-flex rounded-control border border-border" role="group" aria-label="View">
            {(["table", "grid"] as const).map((v) => (
              <Link
                key={v}
                href={href(query, { view: v })}
                aria-current={query.view === v ? "true" : undefined}
                className={cn("px-3 py-1.5 text-sm capitalize", query.view === v ? "bg-primary-light font-semibold text-primary" : "text-text-secondary")}
              >
                {v}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-4">
        <Link href="/admin/courses/categories" className="text-sm text-primary hover:underline">
          Manage categories
        </Link>
      </div>

      <nav aria-label="Course status" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {ADMIN_TABS.map((t) => (
          <Link
            key={t.id}
            href={href(query, { tab: t.id })}
            aria-current={t.id === query.tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              t.id === query.tab ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {t.label} <span className="text-text-muted">({counts[t.id]})</span>
          </Link>
        ))}
      </nav>

      <form method="get" action="/admin/courses" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        {query.tab !== "all" && <input type="hidden" name="tab" value={query.tab} />}
        {query.view !== "table" && <input type="hidden" name="view" value={query.view} />}
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search courses" type="search" name="q" defaultValue={query.q} maxLength={100} hint="Title, slug or instructor" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Category
          <select name="category" defaultValue={query.category} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All categories</option>
            {categories.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {all.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses yet" description="Courses created by instructors will appear here." />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No courses match"
          description="Try another tab, category or search term."
          action={
            <Link href="/admin/courses" className={buttonClasses({ variant: "secondary" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <CourseTable courses={shown} view={query.view} canReview={canReview} />
      )}
    </>
  );
}

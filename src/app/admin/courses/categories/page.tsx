import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CategoryManager } from "@/components/admin/category-manager";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getCategoriesForManagement } from "@/features/admin/categories";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "categories.manage"))) {
    return (
      <>
        <PageHeader title="Categories" />
        <PermissionDeniedState title="You cannot manage categories" description="Ask an administrator if you need access." />
      </>
    );
  }

  const categories = await getCategoriesForManagement(supabase);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Course categories, shown in the catalog and used to filter courses."
        actions={
          <Link href="/admin/courses" className="text-sm text-primary hover:underline">
            ← Back to courses
          </Link>
        }
      />
      <CategoryManager categories={categories} />
    </>
  );
}

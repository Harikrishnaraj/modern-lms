import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Package } from "lucide-react";
import { DeleteContentButton } from "@/components/admin/delete-content-button";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses, Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CONTENT_PAGE_SIZE, getAdminResources, getAdminScormPackages } from "@/features/admin/content";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { formatFileSize } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Content" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function page(v: string | string[] | undefined): number {
  const n = Number.parseInt(one(v), 10);
  return Number.isFinite(n) && n > 0 && n < 10_000 ? n : 1;
}

function pageHref(q: string, resourcePage: number, scormPage: number, over: { resourcePage?: number; scormPage?: number }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const rp = over.resourcePage ?? resourcePage;
  const sp = over.scormPage ?? scormPage;
  if (rp > 1) params.set("resourcePage", String(rp));
  if (sp > 1) params.set("scormPage", String(sp));
  const qs = params.toString();
  return qs ? `/admin/content?${qs}` : "/admin/content";
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 100);
  const resourcePage = page(params.resourcePage);
  const scormPage = page(params.scormPage);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Content" />
        <PermissionDeniedState title="You cannot view content" description="Ask an administrator if you need access." />
      </>
    );
  }

  const canManage = await can(supabase, user.id, "content.manage");
  const [{ resources, total: resourceTotal }, { packages, total: scormTotal }] = await Promise.all([
    getAdminResources(supabase, q, resourcePage),
    getAdminScormPackages(supabase, q, scormPage),
  ]);
  const resourcePages = Math.max(1, Math.ceil(resourceTotal / CONTENT_PAGE_SIZE));
  const scormPages = Math.max(1, Math.ceil(scormTotal / CONTENT_PAGE_SIZE));

  return (
    <>
      <PageHeader title="Content" description="Uploaded media, documents and SCORM packages across every course." />

      <form method="get" action="/admin/content" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search content" type="search" name="q" defaultValue={q} maxLength={100} hint="Name, owner email, course or lesson" />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <Card className="mb-6">
        <CardHeader title="Media & documents" description={`${resourceTotal.toLocaleString("en-US")} resource-library items`} />
        <CardContent>
          {resources.length === 0 ? (
            <EmptyState icon={FileText} title="No matching resources" description="Instructor-uploaded media and documents will appear here." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                    <tr>
                      <th scope="col" className="p-3">Name</th>
                      <th scope="col" className="p-3">Owner</th>
                      <th scope="col" className="p-3">Size</th>
                      <th scope="col" className="p-3">Used by</th>
                      <th scope="col" className="p-3">Uploaded</th>
                      {canManage && <th scope="col" className="p-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {resources.map((r) => (
                      <tr key={r.resourceId}>
                        <td className="p-3 font-medium">{r.name}</td>
                        <td className="p-3">
                          <p>{r.ownerName ?? "Unknown"}</p>
                          {r.ownerEmail && <p className="text-xs text-text-secondary">{r.ownerEmail}</p>}
                        </td>
                        <td className="p-3">{r.sizeBytes === null ? "—" : formatFileSize(r.sizeBytes)}</td>
                        <td className="p-3">{r.usageCount} {r.usageCount === 1 ? "lesson" : "lessons"}</td>
                        <td className="p-3">{dateFormat.format(new Date(r.createdAt))}</td>
                        {canManage && (
                          <td className="p-3">
                            <DeleteContentButton kind="resource" id={r.resourceId} label={r.name} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resourcePages > 1 && (
                <nav aria-label="Resources pagination" className="mt-4 flex items-center justify-between text-sm">
                  {resourcePage > 1 ? (
                    <Link href={pageHref(q, resourcePage, scormPage, { resourcePage: resourcePage - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-text-secondary">Page {resourcePage} of {resourcePages}</span>
                  {resourcePage < resourcePages ? (
                    <Link href={pageHref(q, resourcePage, scormPage, { resourcePage: resourcePage + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      Next
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="SCORM packages" description={`${scormTotal.toLocaleString("en-US")} packages`} />
        <CardContent>
          {packages.length === 0 ? (
            <EmptyState icon={Package} title="No matching SCORM packages" description="Instructor-uploaded SCORM packages will appear here." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                    <tr>
                      <th scope="col" className="p-3">Lesson</th>
                      <th scope="col" className="p-3">Course</th>
                      <th scope="col" className="p-3">Version</th>
                      <th scope="col" className="p-3">Files</th>
                      <th scope="col" className="p-3">Size</th>
                      <th scope="col" className="p-3">Uploaded</th>
                      {canManage && <th scope="col" className="p-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {packages.map((p) => (
                      <tr key={p.packageId}>
                        <td className="p-3 font-medium">{p.lessonTitle}</td>
                        <td className="p-3">{p.courseTitle}</td>
                        <td className="p-3">SCORM {p.version}</td>
                        <td className="p-3">{p.fileCount}</td>
                        <td className="p-3">{formatFileSize(p.totalBytes)}</td>
                        <td className="p-3">{dateFormat.format(new Date(p.uploadedAt))}</td>
                        {canManage && (
                          <td className="p-3">
                            <DeleteContentButton kind="scorm" id={p.packageId} label={p.lessonTitle} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {scormPages > 1 && (
                <nav aria-label="SCORM packages pagination" className="mt-4 flex items-center justify-between text-sm">
                  {scormPage > 1 ? (
                    <Link href={pageHref(q, resourcePage, scormPage, { scormPage: scormPage - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-text-secondary">Page {scormPage} of {scormPages}</span>
                  {scormPage < scormPages ? (
                    <Link href={pageHref(q, resourcePage, scormPage, { scormPage: scormPage + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      Next
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

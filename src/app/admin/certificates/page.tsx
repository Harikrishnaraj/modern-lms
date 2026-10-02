import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, SearchX } from "lucide-react";
import { ReissueCertificateButton } from "@/components/admin/reissue-certificate-button";
import { RevokeCertificateButton } from "@/components/admin/revoke-certificate-button";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CERTIFICATES_PAGE_SIZE,
  parseCertificateQuery,
  searchAdminCertificates,
  type CertificateQuery,
} from "@/features/admin/certificates";
import { getAdminCourses } from "@/features/admin/courses";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Certificates" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function href(q: CertificateQuery, over: Partial<CertificateQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.q) params.set("q", m.q);
  if (m.status) params.set("status", m.status);
  if (m.courseId) params.set("courseId", m.courseId);
  if (m.page > 1) params.set("page", String(m.page));
  const qs = params.toString();
  return qs ? `/admin/certificates?${qs}` : "/admin/certificates";
}

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseCertificateQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Certificates" />
        <PermissionDeniedState title="You cannot view certificates" description="Ask an administrator if you need access." />
      </>
    );
  }

  const canManage = await can(supabase, user.id, "certificates.manage");
  const [{ certificates, total }, allCourses] = await Promise.all([
    searchAdminCertificates(supabase, query),
    getAdminCourses(supabase),
  ]);
  const pages = Math.max(1, Math.ceil(total / CERTIFICATES_PAGE_SIZE));
  const filtered = query.q !== "" || query.status !== "" || query.courseId !== "";

  return (
    <>
      <PageHeader title="Certificates" description={`${total.toLocaleString("en-US")} ${total === 1 ? "certificate" : "certificates"}`} />

      <form method="get" action="/admin/certificates" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search certificates" type="search" name="q" defaultValue={query.q} maxLength={100} hint="Learner name, email or code" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={query.status} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">Any status</option>
            <option value="issued">Issued</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Course
          <select name="courseId" defaultValue={query.courseId} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All courses</option>
            {allCourses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {certificates.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No certificates match"
            description="Try a different search, status or course."
            action={
              <Link href="/admin/certificates" className={buttonClasses({ variant: "secondary" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState icon={Award} title="No certificates yet" description="Certificates will appear here as learners complete courses." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">Learner</th>
                  <th scope="col" className="p-3">Course</th>
                  <th scope="col" className="p-3">Code</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">Issued</th>
                  {canManage && <th scope="col" className="p-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {certificates.map((c) => (
                  <tr key={c.certificateId}>
                    <td className="p-3">
                      <p className="font-medium">{c.learnerName}</p>
                      {c.learnerEmail && <p className="text-xs text-text-secondary">{c.learnerEmail}</p>}
                    </td>
                    <td className="p-3">{c.courseTitle}</td>
                    <td className="p-3 font-mono text-xs">{c.code}</td>
                    <td className="p-3">
                      {c.status === "revoked" ? (
                        <div>
                          <Badge tone="danger" dot>
                            Revoked
                          </Badge>
                          {c.revokedReason && <p className="mt-1 text-xs text-text-secondary">{c.revokedReason}</p>}
                        </div>
                      ) : (
                        <Badge tone="success" dot>
                          Issued
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">{dateFormat.format(new Date(c.issuedAt))}</td>
                    {canManage && (
                      <td className="p-3">
                        {c.status === "revoked" ? (
                          <ReissueCertificateButton certificateId={c.certificateId} />
                        ) : (
                          <RevokeCertificateButton certificateId={c.certificateId} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {query.page > 1 ? (
                <Link href={href(query, { page: query.page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {query.page} of {pages}
              </span>
              {query.page < pages ? (
                <Link href={href(query, { page: query.page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

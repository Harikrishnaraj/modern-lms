import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ModerationRowActions } from "@/components/admin/moderation-actions";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getModerationQueue, MODERATION_PAGE_SIZE, type ReportStatus } from "@/features/admin/moderation";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function parseStatus(v: string | string[] | undefined): ReportStatus | "" {
  const s = one(v);
  return s === "open" || s === "resolved" ? s : "open";
}

function parsePage(v: string | string[] | undefined): number {
  const n = Number.parseInt(one(v), 10);
  return Number.isFinite(n) && n > 0 && n < 10_000 ? n : 1;
}

function href(status: ReportStatus | "", page: number) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/moderation?${qs}` : "/admin/moderation";
}

const KIND_LABEL: Record<string, string> = { thread: "Discussion", post: "Reply", review: "Review" };

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const page = parsePage(params.page);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Moderation" />
        <PermissionDeniedState title="You cannot view the moderation queue" description="Ask an administrator if you need access." />
      </>
    );
  }

  const canManage = await can(supabase, user.id, "moderation.manage");
  const { reports, total } = await getModerationQueue(supabase, status, page);
  const pages = Math.max(1, Math.ceil(total / MODERATION_PAGE_SIZE));

  return (
    <>
      <PageHeader title="Moderation" description={`${total.toLocaleString("en-US")} ${total === 1 ? "report" : "reports"}`} />

      <div className="mb-6 flex gap-2">
        <Link href={href("open", 1)} className={buttonClasses({ variant: status === "open" ? "primary" : "secondary", size: "sm" })}>
          Open
        </Link>
        <Link href={href("resolved", 1)} className={buttonClasses({ variant: status === "resolved" ? "primary" : "secondary", size: "sm" })}>
          Resolved
        </Link>
        <Link href={href("", 1)} className={buttonClasses({ variant: status === "" ? "primary" : "secondary", size: "sm" })}>
          All
        </Link>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={status === "open" ? ShieldCheck : ShieldAlert}
          title={status === "open" ? "No open reports" : "No reports match"}
          description={status === "open" ? "Nothing needs your attention right now." : "Try a different filter."}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.reportId} className="space-y-2 rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="info">{KIND_LABEL[r.reportKind] ?? r.reportKind}</Badge>
                  {r.targetHidden && <Badge tone="neutral">Hidden</Badge>}
                  {r.status === "resolved" && <Badge tone="success">Resolved</Badge>}
                  <span className="text-text-secondary">
                    in <span className="font-medium text-text">{r.courseTitle}</span>
                  </span>
                  <span className="ml-auto text-xs text-text-secondary">{dateFormat.format(new Date(r.createdAt))}</span>
                </div>

                <p className="text-sm">
                  <span className="font-medium">{r.authorName ?? "Unknown"}</span> wrote: <span className="text-text-secondary">&ldquo;{r.targetSnippet}&rdquo;</span>
                </p>
                <p className="text-sm">
                  <span className="font-medium">Reported by</span> {r.reporterName ?? r.reporterEmail ?? "Unknown"}: {r.reason}
                </p>

                {canManage && r.status === "open" && (
                  <ModerationRowActions reportId={r.reportId} kind={r.reportKind} targetId={r.targetId} hidden={r.targetHidden} authorId={r.authorId} />
                )}
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={href(status, page - 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={href(status, page + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
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

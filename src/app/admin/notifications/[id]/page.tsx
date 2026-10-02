import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { Mail } from "lucide-react";
import { getDeliveryLog, listAnnouncements } from "@/features/admin/communication";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Announcement" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  sending: "info",
  sent: "success",
  failed: "danger",
};

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "communication.manage"))) {
    return (
      <>
        <PageHeader title="Announcement" />
        <PermissionDeniedState title="You cannot view this announcement" description="Ask an administrator if you need access." />
      </>
    );
  }

  // No single-row RPC yet; the list is small (capped at 100) so this reuses the existing query.
  const announcements = await listAnnouncements(supabase);
  const announcement = announcements.find((a) => a.id === id);
  if (!announcement) notFound();

  const log = await getDeliveryLog(supabase, id);
  const sent = log.filter((d) => d.status === "sent").length;
  const failed = log.filter((d) => d.status === "failed").length;

  return (
    <>
      <PageHeader
        title={announcement.subject}
        description={`Sent ${announcement.sentAt ? dateFormat.format(new Date(announcement.sentAt)) : "—"}`}
      />

      <Card className="mb-6">
        <CardHeader title="Message" action={<Badge tone={STATUS_TONE[announcement.status] ?? "neutral"}>{announcement.status}</Badge>} />
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{announcement.body}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Delivery log" description={`${sent} delivered · ${failed} failed · ${log.length} total`} />
        <CardContent>
          {log.length === 0 ? (
            <EmptyState icon={Mail} title="No deliveries recorded" description="This announcement has not reached anyone yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="py-2 pr-3 font-medium">Recipient</th>
                    <th className="py-2 pr-3 font-medium">Channel</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Error</th>
                    <th className="py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{d.email}</td>
                      <td className="py-2 pr-3">{d.channel === "in_app" ? "In-app" : "Email"}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={d.status === "sent" ? "success" : "danger"}>{d.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-text-secondary">{d.error ?? "—"}</td>
                      <td className="py-2 text-text-secondary">{dateFormat.format(new Date(d.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { AnnouncementComposeForm } from "@/components/admin/announcement-compose-form";
import { TemplatesPanel } from "@/components/admin/templates-panel";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { listAnnouncements, listTemplates } from "@/features/admin/communication";
import { getAdminCourses } from "@/features/admin/courses";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Communication" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  sending: "info",
  sent: "success",
  failed: "danger",
};

const TARGET_SUMMARY: Record<string, string> = { all_learners: "All learners", role: "By role", course: "By course" };

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "communication.manage"))) {
    return (
      <>
        <PageHeader title="Communication" />
        <PermissionDeniedState title="You cannot manage announcements" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [announcements, templates, courses] = await Promise.all([
    listAnnouncements(supabase),
    listTemplates(supabase),
    getAdminCourses(supabase),
  ]);

  return (
    <>
      <PageHeader title="Communication" description="Targeted announcements, email templates and delivery log." />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="New announcement" />
            <CardContent>
              <AnnouncementComposeForm templates={templates} courses={courses.map((c) => ({ id: c.courseId, title: c.title }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Sent announcements" description={`${announcements.length} total`} />
            <CardContent>
              {announcements.length === 0 ? (
                <EmptyState icon={Megaphone} title="No announcements yet" description="Compose one above to reach learners in-app and by email." />
              ) : (
                <ul className="space-y-2">
                  {announcements.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/admin/notifications/${a.id}`}
                        className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface p-3 hover:bg-background"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{a.subject}</p>
                          <p className="text-xs text-text-secondary">
                            {TARGET_SUMMARY[a.targetType]} · {dateFormat.format(new Date(a.createdAt))}
                          </p>
                        </div>
                        <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader title="Email templates" />
          <CardContent>
            <TemplatesPanel templates={templates} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getRecentSecurityEvents } from "@/features/admin/settings";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/services/settings";

export const metadata: Metadata = { title: "Settings" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "settings.manage"))) {
    return (
      <>
        <PageHeader title="Settings" />
        <PermissionDeniedState title="You cannot view platform settings" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [settings, events] = await Promise.all([getPlatformSettings(supabase), getRecentSecurityEvents(supabase)]);

  return (
    <>
      <PageHeader title="Settings" description="Password, MFA and session policy for the whole platform." />

      <Card className="mb-6">
        <CardHeader title="Password, MFA & session policy" />
        <CardContent>
          <PlatformSettingsForm settings={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Security events" description="Login failures, suspensions, role and permission changes, and settings changes." action={<Link href="/admin/audit" className="text-sm font-medium text-primary hover:underline">View full audit log</Link>} />
        <CardContent>
          {events.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No security events yet" description="Login failures and account/permission changes will appear here." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-text-secondary">
                      {e.actorEmail ?? "System"} &middot; {e.resourceType}
                      {e.resourceId && ` #${e.resourceId.slice(0, 8)}`}
                    </p>
                  </div>
                  <span className="text-xs text-text-secondary">{dateFormat.format(new Date(e.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

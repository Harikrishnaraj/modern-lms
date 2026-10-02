import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ApiKeysPanel } from "@/components/admin/api-keys-panel";
import { WebhooksPanel } from "@/components/admin/webhooks-panel";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getApiKeys, getApiRequestLog, getWebhookEndpoints } from "@/features/admin/integrations";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Integrations" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AdminIntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "integrations.manage"))) {
    return (
      <>
        <PageHeader title="Integrations" />
        <PermissionDeniedState title="You cannot manage integrations" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [keys, endpoints, log] = await Promise.all([getApiKeys(supabase), getWebhookEndpoints(supabase), getApiRequestLog(supabase)]);

  return (
    <>
      <PageHeader title="Integrations" description="API keys, webhooks and request activity for external integrations." />

      <Card className="mb-6">
        <CardHeader title="API keys" description="Read-only reporting API access, scoped per key." />
        <CardContent>
          <ApiKeysPanel keys={keys} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Webhooks" description="Notify an external URL when enrollment.created, course.completed or certificate.issued happens." />
        <CardContent>
          <WebhooksPanel endpoints={endpoints} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Request log" description="The most recent public API requests." />
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-text-secondary">No API requests yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                  <tr>
                    <th scope="col" className="p-3">Key</th>
                    <th scope="col" className="p-3">Method</th>
                    <th scope="col" className="p-3">Path</th>
                    <th scope="col" className="p-3">Status</th>
                    <th scope="col" className="p-3">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {log.map((entry) => (
                    <tr key={entry.id}>
                      <td className="p-3">{entry.keyName ?? "—"}</td>
                      <td className="p-3">{entry.method}</td>
                      <td className="p-3 font-mono text-xs">{entry.path}</td>
                      <td className="p-3">{entry.statusCode}</td>
                      <td className="p-3">{dateFormat.format(new Date(entry.createdAt))}</td>
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

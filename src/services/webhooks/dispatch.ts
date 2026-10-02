import { captureError } from "@/services/error-tracking";
import { signWebhookPayload, type WebhookEvent } from "./index";
import { createAdminClient } from "@/services/supabase/admin";

const DELIVERY_TIMEOUT_MS = 3000;

/**
 * Delivers `event` to every active webhook endpoint subscribed to it. Best-effort and awaited
 * (no background job queue exists yet, per T-140's note on ARCHITECTURE.md §15) so delivery is
 * attempted before the request completes; a failure here never throws back to the caller. One
 * attempt only in this first cut -- no queued retries.
 */
export async function dispatchWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: endpoints } = await admin
      .from("webhook_endpoints")
      .select("id, url, secret")
      .eq("active", true)
      .contains("events", [event]);
    if (!endpoints || endpoints.length === 0) return;

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });

    await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        const signature = signWebhookPayload(endpoint.secret as string, body);
        let responseStatus: number | null = null;
        let status: "success" | "failed" = "failed";
        try {
          const res = await fetch(endpoint.url as string, {
            method: "POST",
            headers: { "content-type": "application/json", "x-webhook-signature": `sha256=${signature}` },
            body,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          });
          responseStatus = res.status;
          status = res.ok ? "success" : "failed";
        } catch {
          status = "failed";
        }
        await admin.from("webhook_deliveries").insert({
          webhook_endpoint_id: endpoint.id,
          event_type: event,
          payload: { event, data: payload },
          status,
          response_status: responseStatus,
          attempt_count: 1,
          delivered_at: status === "success" ? new Date().toISOString() : null,
        });
      }),
    );
  } catch (err) {
    void captureError("webhook.dispatch_failed", err, { webhookEvent: event });
  }
}

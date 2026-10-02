import type { Instrumentation } from "next";
import { captureError } from "@/services/error-tracking";
import { REQUEST_ID_HEADER } from "@/lib/log/request-id";

// Every server error Next.js catches — server components, route handlers, server actions and the
// proxy — is logged with the request ID the proxy assigned and the digest the error page shows,
// so a "Reference" a user quotes leads straight to the log line (T-242).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const raw = request.headers[REQUEST_ID_HEADER];
  const requestId = Array.isArray(raw) ? raw[0] : raw;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  await captureError("request.error", err, {
    requestId,
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  });
};

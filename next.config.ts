import type { NextConfig } from "next";

// SECURITY.md §22. Supabase (auth/rest/storage) is same-origin from the browser's perspective
// only via NEXT_PUBLIC_SUPABASE_URL, so connect-src/img-src/media-src need the wildcard project
// host; there is no other third-party origin yet (fonts are self-hosted via next/font/local, no
// analytics/video/AI/payment provider is wired in). Revisit this list when one is (SECURITY.md
// says so explicitly).
// React's dev mode uses eval() to reconstruct cross-environment stack traces; it never does in
// production, so 'unsafe-eval' is scoped to non-production only.
const isDev = process.env.NODE_ENV !== "production";

function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}
const APP_ORIGIN = originOf(process.env.NEXT_PUBLIC_APP_URL);
// A local Supabase stack (CI, ADR-034) is not under *.supabase.co, so allow its origin explicitly.
const SUPABASE_ORIGIN = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_SOURCES =
  SUPABASE_ORIGIN && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_ORIGIN)
    ? `https://*.supabase.co ${SUPABASE_ORIGIN}`
    : "https://*.supabase.co";
// ADR-029: SCORM packages may run on a dedicated content origin, which the player page frames.
const SCORM_ORIGIN = originOf(process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN);

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${SUPABASE_SOURCES}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_SOURCES}`,
  `media-src 'self' ${SUPABASE_SOURCES}`,
  `frame-src 'self'${SCORM_ORIGIN ? ` ${SCORM_ORIGIN}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

// SCORM package files (/api/scorm/*) must be frameable by the player page and by their own host
// frame, and authoring-tool exports rely on inline scripts and eval. Their isolation comes from
// the sandbox, the separate content origin and the per-lesson token (ADR-029), not from this CSP.
const SCORM_CSP = [
  "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'",
  `frame-ancestors 'self'${APP_ORIGIN ? ` ${APP_ORIGIN}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const SCORM_HEADERS = [
  { key: "Content-Security-Policy", value: SCORM_CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  // The Docker image (Dockerfile, ADR-036) builds with NEXT_OUTPUT=standalone so the runtime image
  // carries only traced files; CI and local `next build` / `next start` stay on the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    // Server Actions default to 1 MB. Course thumbnails may be up to 2 MB (validated in the action);
    // videos and attachments never pass through Next (signed direct-to-storage uploads).
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      // Every route except SCORM package files gets the strict set (X-Frame-Options: DENY etc.).
      { source: "/:path((?!api/scorm/).*)", headers: SECURITY_HEADERS },
      { source: "/api/scorm/:path*", headers: SCORM_HEADERS },
    ];
  },
};

export default nextConfig;

# Modern LMS — Architecture & Product Decisions

This document records durable decisions so AI coding agents do not repeatedly reconsider established choices.

## ADR-001 — Use Next.js + TypeScript

**Decision:** Use Next.js with TypeScript.

**Reason:** The LMS needs a production web application with public pages, protected role portals, server-side authorization, APIs/server actions and SEO-friendly course pages. The supplied Vibe Coding guide also recommends Next.js + TypeScript for a serious beginner-to-production web project.

**Status:** Accepted.

## ADR-002 — Use PostgreSQL / Supabase

**Decision:** Use PostgreSQL through Supabase.

**Reason:** LMS data is relational: users, organizations, courses, curriculum, enrollments, assessments, certificates, payments and audit records. PostgreSQL also gives strong querying and transaction semantics.

**Status:** Accepted.

## ADR-003 — Use Supabase Auth

**Decision:** Use Supabase Auth for the initial authentication implementation.

**Reason:** It integrates with the PostgreSQL/Supabase stack and supports the authentication needs without creating a custom identity system.

**Status:** Accepted.

## ADR-004 — Modular Monolith First

**Decision:** Build a modular monolith rather than microservices.

**Reason:** The LMS has many domains but is still one product. A modular monolith reduces deployment and debugging complexity while preserving domain boundaries for later extraction.

**Status:** Accepted.

## ADR-005 — Three Separate Portal Shells

**Decision:** Learner, Instructor and Admin have separate route namespaces and navigation shells.

**Reason:** Their tasks, information density and permission models differ substantially. Sharing one shell would make the product harder to understand.

**Status:** Accepted.

## ADR-006 — Shared Design System

**Decision:** All portals use one shared component and token system.

**Reason:** The prototypes share visual language even though their layouts differ. Shared primitives prevent visual drift.

**Status:** Accepted.

## ADR-007 — Preserve the LearnSphere Learner IA

**Decision:** Use the learner prototype's navigation as the baseline.

**Reason:** It provides a coherent learning lifecycle around My Learning, Learning Paths, Progress, Assessments, Assignments, Calendar, Certificates and AI Tutor.

**Status:** Accepted.

## ADR-008 — Guided Instructor Course Builder

**Decision:** Use a multi-step course creation workflow.

**Reason:** The instructor prototype makes a complex workflow understandable through explicit stages. This is preferable to one enormous settings page.

**Status:** Accepted.

## ADR-009 — Admin Operational Console

**Decision:** Keep the admin console grouped by operational domain.

**Reason:** The supplied admin prototype clearly separates Users, Courses, Learning Operations, Commerce, Content, Analytics, Communication, AI, Organizations and System.

**Status:** Accepted.

## ADR-010 — Explicit Course State Machine

**Decision:** Course publishing uses explicit state transitions.

**Reason:** Course review and publishing require auditability and controlled permissions.

```text
draft
→ submitted
→ in_review
→ changes_requested
→ approved
→ published
→ archived
```

**Status:** Accepted.

## ADR-011 — Course Versioning

**Decision:** Published course content is versioned.

**Reason:** Learner history, certificates and audit requirements must not be invalidated by editing a currently published course.

**Status:** Accepted.

## ADR-012 — Server-Side Authorization

**Decision:** Every protected mutation is authorized on the server.

**Reason:** Client-side navigation and hidden buttons are not security boundaries.

**Status:** Accepted.

## ADR-013 — PostgreSQL Search First

**Decision:** Start search with PostgreSQL capabilities.

**Reason:** Course/user/admin search does not initially justify an additional search infrastructure dependency. Introduce a dedicated search engine only after measured requirements.

**Status:** Accepted.

## ADR-014 — Storage Abstraction

**Decision:** Store media in object storage and keep metadata in PostgreSQL.

**Reason:** Videos and documents should not be stored as database blobs.

**Status:** Accepted.

## ADR-015 — External Provider Adapters

**Decision:** Payments, email, AI and video services must be accessed through service adapters.

**Reason:** This reduces vendor lock-in and prevents provider-specific code from spreading throughout the application.

**Status:** Accepted.

## ADR-016 — AI Is Assistive

**Decision:** AI-generated content never publishes automatically.

**Reason:** Course quality, assessment integrity and platform safety require human review.

**Status:** Accepted.

## ADR-017 — AI Retrieval Is Permission-Aware

**Decision:** AI retrieval must enforce the same access rules as the underlying application.

**Reason:** A user must not retrieve private organization/course material simply because an embedding exists.

**Status:** Accepted.

## ADR-018 — Playwright for E2E

**Decision:** Use Playwright for browser-level user-flow tests.

**Reason:** The supplied guide recommends Playwright and specifically emphasizes testing complete user flows from the user's perspective.

**Status:** Accepted.

## ADR-019 — Preview Before Production

**Decision:** Every meaningful feature goes through preview/QA before production.

**Reason:** The guide's deployment flow is local → preview → QA → production.

**Status:** Accepted.

## ADR-020 — Vertical Slice Delivery

**Decision:** Implement complete flows instead of entire technical layers.

**Reason:** A working signup → dashboard → course flow provides earlier validation and reduces integration risk.

**Status:** Accepted.

## ADR-021 — Documentation Is Source of Project Context

**Decision:** AI agents must read PRD, architecture, design, rules, tasks and relevant memory before significant implementation.

**Reason:** The supplied guide explicitly recommends giving the AI project context before coding and using structured prompts.

**Status:** Accepted.

## ADR-022 — Do Not Copy Reference Platforms

**Decision:** Coursera/Udemy/Udacity may inform interaction patterns but not copied branding, assets or exact layouts.

**Reason:** The LMS must have its own product identity and design system.

**Status:** Accepted.

## ADR-023 — Prototype Data Is Not Production Data

**Decision:** Sample users, courses, metrics and AI responses from the prototypes are fixtures/demo content only.

**Reason:** They demonstrate UI behavior and information hierarchy but must not become an implicit database design.

**Status:** Accepted.

## ADR-024 — Current Prototype Design Strengths

Keep:
- learner progress visibility,
- instructor course readiness,
- admin pending-action workflow,
- contextual AI,
- analytics drill-down,
- status-driven operations,
- role-specific shells.

Improve:
- replace emoji icons,
- normalize typography/tokens,
- make all states persistent,
- make URL state shareable,
- add permission-aware empty/error/loading states.

## ADR-025 — Avoid Premature Feature Expansion

**Decision:** Core learning lifecycle is implemented before advanced AI, community, mobile and broad commerce.

**Reason:** The supplied guide warns against starting with every feature and recommends defining MVP and out-of-scope functionality first.

## ADR-026 — Self-Hosted Fonts

**Decision:** Load Inter, Plus Jakarta Sans and JetBrains Mono from `@fontsource-variable/*` via `next/font/local`, not `next/font/google`.

**Reason:** Builds must not depend on reaching Google Fonts (sandboxed CI failed with it). Self-hosting also removes a third-party request from the CSP surface (SECURITY.md §22).

**Status:** Accepted.

## ADR-027 — Placeholder Routes From Navigation Config

**Decision:** Each portal has a `[...section]` catch-all that renders a placeholder for any href in `src/config/navigation.ts` (404 otherwise). A real screen is added by creating an explicit route file, which takes precedence.

**Reason:** Real URL routing and navigation exist from day one without shipping fake prototype data (ADR-023). Every nav item carries the TASKS.md ID that builds it.

**Status:** Accepted.

## ADR-028 — Feature Registry Is the Definition of Done

**Decision:** `docs/FEATURES.md` lists every feature from the PRD and the three prototypes. Every task in `TASKS.md` names the features it implements, and `scripts/check-features.mjs` checks both files and the navigation config against each other. `npm run features:strict` must pass before the project is called complete.

**Reason:** AI-assisted builds tend to drop or quietly shrink features. A machine-checked link between features and tasks makes gaps visible, and a feature can only be removed through an explicit ADR. This supersedes the "Later" bucket in the original task list: deferred features are now scheduled in Phases 5–12, not dropped.

**Status:** Accepted.

## ADR-029 — SCORM Delivery: Signed Asset Tokens and an Optional Content Origin

**Decision:** SCORM package files are served at `/api/scorm/<lessonId>/<token>/<path>`, where the token is a short-lived HMAC (user + lesson + expiry, key derived from the service-role key) minted only after RLS lets the viewer read the lesson. The route trusts the token, not a cookie. Every HTML file gets the API shim, and a generated host frame (`__lms_frame.html`) holds the API in the parent window for drivers that use the ADL parent search (Rustici scormdriver, i.e. Articulate Storyline). When `NEXT_PUBLIC_SCORM_CONTENT_ORIGIN` names a host distinct from the app, the player frame is served from it with `allow-scripts allow-same-origin allow-modals`, and the proxy returns 404 for everything on that host except `/api/scorm`. Without it, the T-138 behaviour stands: a fully isolated `allow-scripts` sandbox on the app origin.

**Reason:** Manual QA with a real Storyline package showed three blockers. HTML came back from storage as `text/plain`. The sandboxed frame never sends the session cookie, so every sub-file returned 401. The driver only looks for the API in `window.parent`, which is cross-origin under a unique-origin sandbox. The strict same-origin sandbox chosen in T-138 therefore can only run single-page packages. Authoring-tool exports need their frames to share one origin that is not the app's.

**Status:** Proposed. The content origin partly revisits the T-138 choice of no separate subdomain, so it needs the user's confirmation. Production needs a DNS name pointing at the same deployment.

## ADR-030 — Adding Assignments to a Live Course

**Decision:** An instructor may **add** a new assignment to their own published (live) course from the Assignments page, without starting a new version. It is created in the published version, so enrolled learners see it straight away, and — when a newer editable draft exists on top — in that draft too, so the next publish does not drop it. This is additive only: existing live assignments stay locked for editing and deleting, exactly as ADR-011 requires, and everything else in a live course still goes through a new draft version and review. Learners pinned to an older archived version do not get the new assignment. When the newest version is in review (not editable), the assignment goes to the live version only.

**Reason:** Instructors need to set new work for a running cohort (the Assignments page mockup assigns to a live course that already has submissions). Adding a new, separate assignment cannot rewrite any learner's existing history, submission, grade or certificate, which is what ADR-011 protects; changing or removing an assignment that learners may already be working on could, so that stays locked.

**Status:** Accepted (user decision, T-114). Narrows ADR-011; does not replace it.

## ADR-031 — Stripe for Payments (Test Mode First)

**Decision:** Commerce (T-180–T-188) uses **Stripe**, behind the payment adapter required by ADR-015. Development and QA use Stripe **test mode** only; live keys are a separate, later decision. Enrollment in a paid course happens only after a verified Stripe webhook (signature checked, event ID stored for idempotency), never from the browser redirect.

**Reason:** User decision (2026-10-01). Stripe covers checkout, subscriptions, coupons, refunds and payouts (Connect) in one provider; the adapter keeps a second provider (for example Razorpay for India) possible later without touching feature code.

**Status:** Deferred (2026-10-01) — the user put the payment provider decision on hold shortly after choosing Stripe ("for payment we will decide later"). Kept as the leading option; commerce tasks T-180–T-188 stay open until a provider is confirmed.

## ADR-032 — Production Hosting on Cloudflare Workers (vinext)

**Decision:** Preview and production deployments run on **Cloudflare Workers** using **vinext** (Cloudflare's Vite-based reimplementation of the Next.js API surface), not Vercel. The Worker is named `modern-lms` (already created in the user's Cloudflare account). Supabase stays the database, auth and storage provider. CI keeps running the normal `next build` as well, so the app stays deployable to any standard Next.js host.

**Reason:** User decision (2026-10-01). Checked before choosing the adapter: Next.js 16 runs `src/proxy.ts` on the Node.js runtime with no option to change it, and Cloudflare's OpenNext adapter documents Node.js middleware as "not yet supported" — our session refresh, portal guards, MFA and idle-timeout checks all live in the proxy, so OpenNext is not viable today. Cloudflare recommends vinext for Next.js 16 apps; `npx vinext check` reports this project 95% compatible (all `next/*` imports, the App Router, server actions, route handlers and `src/proxy.ts` supported). The one flagged issue is `__dirname` in a test helper (`tests/e2e/support/env.ts`), not app code.

**Risks:** vinext is in beta. Mitigations: full E2E suite against the Cloudflare preview before any production promotion (ADR-019); keep `next build` green in CI as a fallback path.

**Status:** Superseded by ADR-035 (2026-10-02). Narrowed the "Vercel or equivalent" line in ARCHITECTURE.md; T-248 previews had moved to Cloudflare.

## ADR-033 — Organization SSO via OIDC First

**Decision:** Organization SSO (T-165, F-504) is built on Supabase Auth **custom OIDC providers**, which work on the current Free plan (up to 3 providers per project). Each organization is linked to one provider; a user who signs in through it is placed in that organization. **SAML 2.0** (Pro plan and above) is added later, when a customer needs it, behind the same organization ↔ provider mapping.

**Reason:** User decision (2026-10-01). Verified in Supabase's docs: SAML SSO requires Pro ($25/month, 50 SSO MAU included, $0.015 per extra); custom OIDC providers are available on Free (3 providers; unlimited on Pro). Microsoft Entra, Okta, Google Workspace and Auth0 all speak OIDC.

**Notes:** Supabase does not link an SSO identity to an existing password account with the same email, so the design must handle a person who already signed up with a password.

**Status:** Accepted (user decision).

## ADR-034 — CI Tests Run Against a Local Supabase Stack

**Decision:** Every CI job (Check and each E2E shard) starts its own Supabase stack with the Supabase CLI (Docker) from `supabase/config.toml` and `supabase/migrations`, seeds it with `scripts/seed.mjs`, and runs the integration and E2E tests against it. CI no longer uses the hosted `modern-lms` project or its secrets. `config.toml` mirrors the hosted Auth settings the tests rely on (email confirmation on, TOTP MFA on, Google provider on, sign-ups open, anonymous sign-ins off) and raises per-IP auth rate limits for the suite. The CSP allows the configured Supabase origin when it is not a `*.supabase.co` host, so production's policy is unchanged.

**Reason:** User decision (2026-10-02, T-251). Six E2E shards sharing the free-tier project took it down about 10 minutes into each run (statement timeouts, Auth 504s, no DB connections), failing every shard and making the dev database unusable meanwhile. Throttling to two workers kept it up but made CI take about 2.5 hours. A stack per job is isolated, has no cross-region latency (GitHub's runners are in the US, the project is in ap-south-1) and lets fork PRs run the full suite.

**Notes:** The hosted project is still the source of truth for production settings; a hosted Auth setting a test depends on must be mirrored in `config.toml`. Testing against the real deployment belongs to the production QA checklist (T-250).

**Status:** Accepted (user decision).

## ADR-035 — Cloudflare Removed; Hosting Not Chosen Yet

**Decision:** The Cloudflare Workers / vinext setup from ADR-032 is removed: `cloudflare.config.ts`, `vite.config.ts`, the vinext and Cloudflare packages and scripts, the `build:vinext` CI step, the GitHub Actions deploy job, and the Cloudflare Claude Code plugin config. The app builds and runs only as standard Next.js (`next build` / `next start`). No hosting provider is chosen; CI keeps proving every change is deployable (Check + full E2E on a local Supabase stack, ADR-034).

**Reason:** User decision (2026-10-02): "No need for cloudflare", remove it all, no hosting preference yet. Cloudflare Workers Builds failed on every push (dashboard build settings), and the vinext path added a second, beta build to keep green. The user has also floated a VPS with a self-hosted open-source AI model, which a plain Next.js server fits directly.

**Consequences:** T-248 (preview deployments) and T-250 (production deploy) stay open and are blocked on the hosting decision; their IDs and F-947 are unchanged. Kept from the vinext work because they stand on their own: React 19.3, `"type": "module"`, `next typegen` before `tsc`, and the unique MFA factor name per enrolment (a real double-render race). The Cloudflare Workers Builds Git integration and the `modern-lms` Worker live in the user's Cloudflare account and must be disconnected/deleted there.

**Status:** Accepted (user decision). Supersedes ADR-032. Hosting chosen in ADR-036 (VPS).

## ADR-036 — Production on a VPS with Docker, Deployed by GitHub Actions

**Decision:** Production runs on the user's Ubuntu VPS. The stack has three containers (`deploy/docker-compose.yml`): the Next.js **standalone** server (built from `Dockerfile` with `NEXT_OUTPUT=standalone`), **Caddy** for HTTPS and reverse proxy, and a tiny **cron** container that calls `/api/cron/scheduled-reports` hourly. The CI workflow's `deploy` job runs after Check and every E2E shard pass, on pushes to `main` or a manual "Run workflow". It builds the image, pushes it to GHCR (private) and deploys over SSH as a `deploy` user. The job writes the server `.env` from repository secrets on each deploy, then runs `docker compose pull && up -d` and a smoke check. Until the user has a domain, hostnames default to sslip.io names derived from the IP (`<ip-dashed>.sslip.io` for the app, `content-<ip-dashed>.sslip.io` as the SCORM content origin), so HTTPS works from day one; `PROD_APP_HOST`/`PROD_CONTENT_HOST` override them. Setup steps: `docs/DEPLOY.md`.

**Reason:** User decision (2026-10-02): host on their VPS (no domain yet). A plain Next.js server needs no adapter, matches what CI already tests (`next build`), and leaves room for the self-hosted open-source AI model the user has mentioned. Serving plain HTTP by IP is not an option: the CSP has `upgrade-insecure-requests`, HSTS is on, and the SCORM content origin must be a second host. sslip.io gives two real hostnames with valid certificates without buying a domain.

**Consequences:** `NEXT_PUBLIC_*` values are build arguments (inlined into the client bundle), so a hostname change needs a new build, which a re-run of the deploy job does. Server secrets live only in GitHub secrets and the server's `.env` (mode 600). There is a single instance and no zero-downtime rollout: the restart takes a few seconds. Preview deployments per PR (the rest of F-947 / T-248) are not covered yet. Running them on the same VPS (one stack per PR under its own sslip.io name) is the follow-up. Supabase Auth's Site URL and redirect list must include the production host.

**Status:** Accepted (user decision).


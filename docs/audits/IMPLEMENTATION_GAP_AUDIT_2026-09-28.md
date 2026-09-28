# MODERN LMS — IMPLEMENTATION GAP AUDIT

```text
MODERN LMS
IMPLEMENTATION GAP AUDIT

Audit Date:        2026-09-28
Repository/Build:  harikrishnaraj/modern-lms — Next.js 16.3.6 (App Router) + Supabase
Version/Commit:    ab314e3 "wip: instructor reviews list, distribution and reply (T-109, in progress)"

Portals Audited:
- Learner
- Instructor
- Admin
(+ cross-cutting: auth, course lifecycle, commerce, AI, RAG, platform)

Total Features Audited:  98  (every row of docs/FEATURES.md)

Implemented:             43
Partially Implemented:   14
UI Only:                  0
Mock/Demo:                0
Backend Only:             2
Missing:                 39
Blocked:                  0   (runtime verification is limited — see §0.3)
```

> **Scope rule.** This is a report only. No application code was changed. The feature inventory is
> the project's own registry, `docs/FEATURES.md` (98 features, sourced from PRD §8/§12–§16, the three
> prototypes, SECURITY.md and TEST_PLAN.md). Nothing outside that registry is counted as "expected".

---

## 0. Method, evidence and limits

### 0.1 What was inspected

- Docs: `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `DECISIONS.md`, `MEMORY.md`, `SECURITY.md`,
  `TEST_PLAN.md`, `FEATURES.md`, `TASKS.md`.
- All 326 files under `src/` (routes, server actions, services, components, config).
- All 48 migrations in `supabase/migrations/` (45 tables, 5 storage buckets, 79 SQL functions).
- `scripts/seed.mjs`, `scripts/check-features.mjs`, `next.config.ts`, `playwright.config.ts`.
- 110 unit/integration test files and 55 E2E specs (inventory only; see §0.3).

For each feature the chain **UI → server action / route / RPC → authorization → business logic →
database → state change → audit/notification** was traced in code. A visible button, nav item or
table alone was not counted as implementation.

### 0.2 Checks run in this audit (at `ab314e3`)

| Check | Result | Detail |
| --- | --- | --- |
| `npm ci` | ✅ pass | |
| `npm run lint` | ✅ pass | |
| `npm run typecheck` | ❌ **fail** (22 errors) | 3 in app code: `variant="outline"` is not a `ButtonVariant` — `src/app/instructor/reviews/page.tsx:146`, `src/components/instructor/review-card.tsx:216,240`. 19 in `tests/integration/instructor-reviews.test.ts` (untyped `rpc` args / `null` casts). |
| `npm test` (Vitest) | ❌ **fail** | 455 passed, 295 skipped (live-Supabase suites skip without env), **2 suites fail**: `courses-rls.test.ts` and `instructor-reviews.test.ts` build a Supabase client outside their `skipIf` guard → `supabaseUrl is required`. |
| `npm run build` | ❌ **fail** | Compiles, then fails at "Running TypeScript" on the three app-code errors above. |
| `npm run features` | ✅ consistent | Ledger: **38/98 features complete (39%)**, 77/137 tasks done. Next task: T-109. |
| `npm run features:strict` | ❌ fail (expected) | Project definition of "finished" is not met. |

The build and typecheck failures are introduced by the in-progress T-109 commit (HEAD is a `wip:`
commit). The previous commit (T-108) is not re-verified here.

### 0.3 Verification limits (why nothing is classed BLOCKED, and what could not be run)

- **No `.env.local` / Supabase credentials in this environment.** The 42 live-Supabase integration
  suites were skipped and the 55 Playwright E2E specs could not be run. RLS policies, RPCs and
  flows were therefore verified by **reading the SQL and TypeScript**, not by executing them.
- **Prototype source files are not in the repository.** Only their screen inventories
  (`MEMORY.md` "Source Prototypes Reviewed") and specs (`DESIGN.md` §14–§17) are available.
  "UI matches design" is therefore judged against documented elements, **not visual fidelity**.
- **Supabase dashboard settings** (e.g. "Confirm email", leaked-password protection, SMTP) are not
  codified in the repo (no `supabase/config.toml`) and could not be observed.

No feature was left unclassifiable, so the BLOCKED count is 0. Runtime confirmation of every
"IMPLEMENTED" row is still outstanding until integration + E2E are run against a live project.

### 0.4 Ledger vs. code-level result

The project ledger (`npm run features`) says 38 complete; this audit finds 43 implemented. Two
differences explain it:

| Direction | Features | Why |
| --- | --- | --- |
| Ledger **complete**, audit **downgraded** | F-007, F-103, F-107, F-112, F-401 | Code-level gaps (see §4 / §18). |
| Ledger **incomplete**, audit **implemented** | F-206–F-214, F-406 | Code is complete; the ledger waits only on unticked umbrella E2E tasks T-113 / T-145. |

38 − 5 + 10 = **43**.

---

## 1. Feature classification (all 98 features)

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · 🔧 BACKEND ONLY · ⛔ MISSING

### Authentication & access

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-001 | Signup & login | ✅ | `features/auth/sign-up.ts`, `login.ts` (zod, generic errors, suspended block) |
| F-002 | Email verification | ✅ | `/verify-email`, `resend-verification.ts`, `/auth/callback`. Enforcement relies on the Supabase "Confirm email" project setting (not in repo). |
| F-003 | Password reset | ✅ | `forgot-password.ts`, `reset-password.ts`, rate limited |
| F-004 | Session & logout | ✅ | `lib/supabase/middleware.ts` refresh, `proxy.ts` redirect, `auth/logout.ts` |
| F-005 | Admin MFA | ✅ | `/mfa`, `lib/permissions/mfa.ts` (AAL2, fail-closed) in proxy + admin layout + audit export |
| F-006 | Roles & role-aware routing | ✅ | 7 roles seeded; `features/auth/roles.ts` `getPortalPathForUser` |
| F-007 | Server-side authorization | 🟡 | Portal guards + 11 permissions + RLS work; **org isolation cannot hold** (no orgs), `org_admin` reaches the admin console unscoped. |
| F-008 | Learner onboarding | ✅ | `/onboarding`, `learner_onboarding`; interests feed dashboard recommendations |

### Learner

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-100 | Dashboard | ✅ | `features/dashboard/data.ts` — six blocks from real queries, empty states |
| F-101 | Catalog, search, filters | ✅ | `search_courses` RPC (tsvector + GIN), all six filters, pagination |
| F-102 | Course detail | ✅ | `get_course_detail`, `generateMetadata` + OpenGraph |
| F-103 | Enrollment | 🟡 | Free enrollment real (`enroll.ts`). **Paid courses are refused** (`enroll.ts:26`); UI says "Checkout is coming soon" (`enrollment-panel.tsx:73`). |
| F-104 | My Learning | ✅ | `my_learning` RPC, in-progress/completed/saved |
| F-105 | Course player | ✅ | sidebar, prev/next, locked lessons, preview flag |
| F-106 | Progress & resume | ✅ | `completeLesson`, `saveVideoPosition` → `lesson_progress` |
| F-107 | Assessments / quizzes | 🟡 | Auto-graded types work; answer keys in a separate `assessment_answer_keys` table. **Essay/coding attempts are never graded** (see GAP-002). |
| F-108 | Assignments | ✅ | submission upload, deadline lock, grading + feedback |
| F-109 | Certificates | ✅ | `tryEvaluateCompletion` issues immutable certificate; list page |
| F-110 | Public verification | ✅ | `verify_certificate` RPC; valid/revoked states; rate limited |
| F-111 | Learning paths | ✅ | `learning_paths`, `path_enrollments`, ordered progress |
| F-112 | Calendar | 🟡 | Assignment due dates + past assessment attempts + certificates. **Assessments have no due/scheduled date**, and no sessions exist. |
| F-113 | Discussions | ✅ | threads, replies, votes, answered, report; sanitized |
| F-114 | Progress & skills | ✅ | `my_progress` RPC; skills **derived from course categories** (`progress.ts:96`) |
| F-115 | Notifications | ✅ | persistent, read/unread, per-category in-app prefs. In-app only (no email channel). |
| F-116 | Profile & settings | ✅ | name, avatar, password (rate limited), notification prefs |
| F-117 | Ratings & reviews | ✅ | completed-learner only, one per course |

### Instructor

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-200 | Overview dashboard | ✅ | own-course KPIs, "waiting for review" |
| F-201 | My Courses & overview | ✅ | `instructor_courses` RPC, status filters |
| F-202 | Guided creation | ✅ | basics → pricing/settings, draft on every save |
| F-203 | Curriculum builder | ✅ | CRUD + drag + keyboard reorder |
| F-204 | Lesson editor & media | ✅ | sanitized rich text, signed direct uploads via storage adapter |
| F-205 | Assessment builder | ✅ | all six PRD §10 types; pass mark, attempts, time limit |
| F-206 | Assignment builder & grading | ✅ | rubric, due date, `instructor_grading_queue`, `grade_assignment_submission` |
| F-207 | Question bank | ✅ | `question_bank_items`, tags, import |
| F-208 | Course preview | ✅ | reuses learner player |
| F-209 | Readiness checklist | ✅ | pure rules + linked UI; gates submission |
| F-210 | Submit for review | ✅ | `submit_course_version` + `course.submitted` audit |
| F-211 | Review feedback & resubmit | ✅ | `course_review_notes`, reopen, version history |
| F-212 | Publish & versioning | ✅ | `create_draft_version`, audited |
| F-213 | Students & detail | ✅ | segments, per-lesson progress, own courses only |
| F-214 | Instructor discussions | ✅ | unanswered queue, reply, pin, hide, resolve reports |
| F-215 | Messaging | 🟡 | Instructor side complete. **Learners have no messages screen** (see GAP-004). |
| F-216 | Analytics | 🟡 | KPIs, trends, lesson drop-off, question difficulty, scoped CSV. **Revenue is estimated from list price; watch time from resume position; no replay metric.** |
| F-217 | Reviews management | 🟡 | T-109 in progress: page + RPCs exist, **build broken**. |
| F-218 | Instructor certificates | ⛔ | nav → placeholder "Coming in T-110" |
| F-219 | Resource library | ⛔ | nav → placeholder "Coming in T-111" |
| F-220 | Settings & public profile | ⛔ | nav → placeholder "Coming in T-112" |

### Course lifecycle

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-310 | Course state machine | ✅ | `transition-rules.ts` + `apply_course_transition` + `course_status_transitions`, audited |

### Admin

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-400 | Overview & pending actions | ✅ | `admin_overview` RPC, pending reviews, audit activity |
| F-401 | User management | 🟡 | search, add, suspend, role change (audited). **Invite sends no email**; admin copies a link by hand. |
| F-402 | User detail | ⛔ | no `/admin/users/[id]` route |
| F-403 | Instructor management | ⛔ | placeholder (T-131/T-132) |
| F-404 | Roles & permissions | ⛔ | placeholder (T-133) |
| F-405 | Courses & categories | 🟡 | status tabs, table/grid, search, bulk start-review/archive. **No categories CRUD** (T-134). |
| F-406 | Course review workflow | ✅ | checklist, section notes, approve/changes/reject/publish/archive, audited |
| F-407 | Enrollments & cohorts | ⛔ | placeholder (T-135); no cohort table |
| F-408 | Assessment oversight | ⛔ | placeholder (T-136) |
| F-409 | Certificate administration | 🔧 | DB supports revoke (`certificates.status`, guard + event triggers; verify page renders revoked). **No action or UI.** |
| F-410 | Content, media & SCORM | ⛔ | placeholder (T-138) |
| F-411 | Moderation | 🔧 | `discussion_reports`, `set_discussion_hidden`, `can_moderate_discussions` includes `course.review`. Used only in the instructor portal. **No admin queue, no review reports, no ban.** |
| F-412 | Platform analytics | 🟡 | daily enrollments/completions/signups + top courses. **No saved reports or export.** |
| F-413 | Communication | ⛔ | placeholder (T-141); no email sending anywhere |
| F-414 | Audit logs | 🟡 | append-only table, screen, filters, audited CSV export. **Several SECURITY §17 events never written** (GAP-028). |
| F-415 | Integrations & API | ⛔ | placeholder (T-142) |
| F-416 | Settings & security | ⛔ | placeholder (T-143) |
| F-417 | Admin profile | ⛔ | no route |

### Organizations / enterprise — all ⛔

F-500 organizations/departments/teams · F-501 scoped Org Admin · F-502 assigned learning ·
F-503 org reports · F-504 SSO. No tables, routes or services. The `org_admin` **role** exists
(seeded, granted `portal.admin.access`).

### Commerce — all ⛔

F-600 checkout/orders/payments · F-601 subscriptions · F-602 coupons · F-603 refunds ·
F-604 instructor earnings/payouts · F-605 admin revenue. No payment adapter, no `orders`/`payments`
tables, no webhook route. Placeholders at `/instructor/earnings` and `/admin/commerce`.

### AI — all ⛔

F-700 AI adapter/policy/usage · F-701 Learner AI Tutor · F-702 instructor drafting ·
F-703 instructor insights · F-704 admin AI management. No provider SDK in `package.json`, no
`ai_*` tables. Placeholders at `/learner/ai-tutor` (also in the mobile bottom bar),
`/instructor/ai`, `/admin/ai`.

### Knowledge base / RAG — all ⛔

F-800 ingestion · F-801 permission-aware retrieval · F-802 KB admin. No `knowledge_*` tables, no
pgvector usage. Placeholder at `/admin/rag`.

### Platform & quality

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-900 | Foundation & tooling | 🟡 | Scripts exist; **`check` fails at HEAD** (typecheck/build). Next 16 installed, `eslint-config-next` still 15.5.26, T-247 open. |
| F-901 | Design system | ✅ | tokens in `globals.css`, `components/ui/*` |
| F-902 | Portal shells & navigation | ✅ | three shells, URL routing, mobile bar. Admin nav not filtered by role (GAP-057). |
| F-903 | Dev seed (fixtures only) | ✅ | `scripts/seed.mjs`; `tests/unit/seed-isolation.test.ts` blocks imports |
| F-940 | Security headers & CSP | ⛔ | `next.config.ts` has no `headers()`; none set in `proxy.ts` |
| F-941 | Rate limiting | 🟡 | 8 buckets (login, reset, verify, assessment submit, cert verify, discussion post/react, messaging). **Signup, uploads, public catalog, analytics/export not limited**; limiter **fails open**. |
| F-942 | Logging / correlation IDs | ⛔ | `console.error` only; no request IDs or error tracker |
| F-943 | Privacy export & deletion | ⛔ | no route, action or job |
| F-944 | Accessibility WCAG 2.2 AA | ⛔ | good ARIA usage in code, but no audit or axe tooling |
| F-945 | Responsive 375/768/1024/1440 | 🟡 | Playwright projects at 375 and 1440 only |
| F-946 | Performance budget | ⛔ | no budgets or measurements in repo |
| F-947 | CI & deployment | ⛔ | no `.github/` workflows |
| F-948 | Backups & recovery | ⛔ | no runbook or restore test |

---

## 2. Executive findings

1. **The build is broken at HEAD.** `npm run build` and `npm run typecheck` fail due to the WIP
   T-109 commit. Nothing can be deployed from this commit.
2. **The core learning loop has one hard break.** Any course with an essay or coding question can
   never be completed. Those attempts stay `submitted` forever, the completion rule counts them as
   not passed, and no certificate is issued.
3. **Paid courses cannot be enrolled in.** There is no commerce layer at all. "Revenue" shown to
   instructors is an estimate (enrollments × list price), not money received.
4. **Messaging is one-way.** Instructors can message learners, but learners have no screen to read
   the thread or reply.
5. **The admin console is ~11% built.** 14 of 18 admin nav entries are "Coming in T-xxx"
   placeholders. Certificate revocation and platform moderation exist only in the database.
6. **Four whole domains are absent:** organizations, commerce, AI and RAG (19 features, 0 code).
   The `org_admin` role still gets unscoped admin-console access.
7. **Production hardening has not started:** no CSP/security headers, CI, structured logging,
   privacy workflows, backups, or accessibility/performance audits.
8. **No mock data was found in the app.** Every built screen reads real data; the seed is isolated
   from `src/` by a test. Unbuilt screens render an honest placeholder, not fake numbers.

---

## 3. Main gap table

| ID | Portal | Feature | Expected | Current state | Status | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-001 | Platform | Build / typecheck (F-900) | `npm run check` passes | typecheck + build fail at HEAD | PARTIAL | **P0** | `reviews/page.tsx:146`, `review-card.tsx:216,240` use nonexistent `variant="outline"` |
| GAP-002 | Learner | Essay/coding grading (F-107) | Manually graded questions get a score; course can complete | Attempts stay `submitted`; nothing sets `graded`; completion blocked; no certificate | PARTIAL | **P0** | `features/completion/rules.ts:5`, `assessments/grading.ts:36`; no writer of `assessment_attempts.status='graded'` |
| GAP-003 | Learner | Paid enrollment (F-103, F-600) | Paid course enrolls after verified payment | Refused server-side; "Checkout is coming soon" | PARTIAL | P1 | `enrollment/enroll.ts:26`, `courses/enrollment-panel.tsx:73` |
| GAP-004 | Learner/Instructor | Two-way messaging (F-215) | 1:1 threads for both parties | Instructor UI only; learner gets a notification copy, cannot reply | PARTIAL | P1 | no learner messages route; RLS allows learner read/send (`20260926100000_messaging.sql:44-67`) |
| GAP-005 | Instructor | Reviews management (F-217) | Ratings list, distribution, reply | Page + RPCs written; build broken; T-109 open | PARTIAL | P1 | `app/instructor/reviews`, `20260926130000_instructor_reviews.sql` |
| GAP-006 | Instructor | Analytics accuracy (F-216) | Revenue, watch time, replay, drop-off | Revenue = Σ list price of enrollments; watch time = Σ resume position; no replay metric | PARTIAL | P2 | `20260926110000_instructor_analytics.sql:72,201`; `…extended_analytics.sql` export; no "replay" anywhere |
| GAP-007 | Instructor | Certificates (F-218) | Issued list + template settings | Placeholder | MISSING | P2 | `/instructor/certificates` → `PlaceholderPage` |
| GAP-008 | Instructor | Resource library (F-219) | Reusable assets with usage count | Placeholder | MISSING | P2 | `/instructor/resources` |
| GAP-009 | Instructor | Settings & public profile (F-220) | Profile, payout details, notifications | Placeholder | MISSING | P2 | `/instructor/settings` |
| GAP-010 | Instructor | Earnings & payouts (F-604) | Earnings = paid orders − refunds/fees | Placeholder; no payments data | MISSING | P2 | `/instructor/earnings` |
| GAP-011 | Instructor | AI drafting (F-702) | Editable drafts, never auto-published | Placeholder | MISSING | P2 | `/instructor/ai` |
| GAP-012 | Instructor | AI insights (F-703) | Review summaries, drop-off suggestions | Nothing | MISSING | P2 | — |
| GAP-013 | Learner | AI Tutor (F-701) | Contextual tutor with sources | Placeholder, linked from sidebar and mobile bottom bar | MISSING | P2 | `/learner/ai-tutor`; `navigation.ts` `mobileBar` |
| GAP-014 | Learner | Calendar (F-112) | Deadlines **and assessments** on correct dates | Assessments have no due date; only past attempts show; no sessions | PARTIAL | P2 | `calendar/events.ts:47-69`; `assessments` table has no date column |
| GAP-015 | All | RBAC boundaries (F-007) | Every TEST_PLAN §4 boundary holds | Org-admin boundary impossible; `org_admin` reaches admin console and platform-wide overview counts | PARTIAL | P1 | `20260923124550_portal_permissions.sql`; `admin_overview` checks only `portal.admin.access` |
| GAP-016 | Admin | User invite (F-401) | Invitation delivered | Account + link created; admin copies link by hand | PARTIAL | P3 | `admin/user-actions.ts:155-186` ("No email is sent from here") |
| GAP-017 | Admin | User detail (F-402) | Sessions, login history, progress, skills | No route | MISSING | P2 | no `/admin/users/[id]` |
| GAP-018 | Admin | Instructor management (F-403) | Verification queue, detail with revenue | Placeholder; no application table | MISSING | P2 | `/admin/instructors` |
| GAP-019 | Admin | Roles & permissions (F-404) | Editable, audited matrix; last Super Admin protected | Placeholder | MISSING | P2 | `/admin/roles` |
| GAP-020 | Admin | Categories CRUD (F-405) | Create/edit/delete categories | Categories exist only via seed/migration | PARTIAL | P1 | no categories action/route; T-134 open |
| GAP-021 | Admin | Enrollments & cohorts (F-407) | Manual enroll, cohorts, bulk assign | Placeholder; no cohort table | MISSING | P2 | `/admin/enrollments` |
| GAP-022 | Admin | Assessment oversight (F-408) | Averages, quality flags, audited attempt reset | Placeholder | MISSING | P2 | `/admin/assessments` |
| GAP-023 | Admin | Certificate admin (F-409) | Search, revoke (audited), reissue | Revoke supported by schema/triggers only; no action or UI; `certificate.revoked` never written by the app | BACKEND ONLY | P1 | `20260924100000_certificates.sql:23-81`; `/admin/certificates` placeholder |
| GAP-024 | Admin | Content / SCORM (F-410) | Validated uploads, SCORM launch + completion | Placeholder | MISSING | P2 | `/admin/content` |
| GAP-025 | Admin | Moderation (F-411) | Report queue, hide/restore, ban | Discussion report/hide backend exists and is used per course by instructors only; no admin queue; reviews not reportable; no ban | BACKEND ONLY | P1 | `20260925130000_discussions.sql`, `…131000_discussion_report_hardening.sql`; `/admin/moderation` placeholder |
| GAP-026 | Admin | Platform analytics (F-412) | Dashboards, saved reports, export | Basic daily series + top courses only | PARTIAL | P2 | `admin_analytics_daily`, `admin_top_courses` |
| GAP-027 | Admin | Communication (F-413) | Targeted announcements, templates, delivery log | Placeholder; no email delivery in app | MISSING | P2 | `/admin/notifications`; `services/notifications` in-app only |
| GAP-028 | Admin | Audit coverage (F-414) | Every SECURITY §17 action recorded | `auth.login_failed`, `certificate.revoked`, `settings.changed` declared, never written; lesson/section deletion not audited; no login/security events | PARTIAL | P1 | `services/audit/index.ts:4-23` vs 9 call sites |
| GAP-029 | Admin | Integrations & API (F-415) | Hashed scoped keys, webhooks, request log | Placeholder | MISSING | P2 | `/admin/integrations` |
| GAP-030 | Admin | Settings & security (F-416) | Password/MFA/session policies enforced | Placeholder | MISSING | P1 | `/admin/settings` |
| GAP-031 | Admin | Admin profile (F-417) | Info, security, recent actions | No route | MISSING | P3 | — |
| GAP-032 | Admin | Organizations (F-500) | CRUD + membership, RLS isolation | Nothing | MISSING | P2 | `/admin/organizations` placeholder |
| GAP-033 | Admin | Scoped Org Admin (F-501) | Org Admin sees only own org | Role exists with unscoped console access | MISSING | P1 | see GAP-015 |
| GAP-034 | Admin | Assigned learning (F-502) | Due dates, overdue tracking | Nothing | MISSING | P2 | — |
| GAP-035 | Admin | Org reports (F-503) | Completion/overdue/hours + export | Nothing | MISSING | P2 | — |
| GAP-036 | All | Org SSO (F-504) | SSO maps users to org | Nothing | MISSING | P2 | — |
| GAP-037 | Cross | Checkout / orders / payments (F-600) | Verified, idempotent webhooks | Nothing | MISSING | P1 | no adapter, tables or webhook route |
| GAP-038 | Cross | Subscriptions (F-601) | Server-side entitlements | Nothing | MISSING | P2 | — |
| GAP-039 | Cross | Coupons (F-602) | Limits + expiry | Nothing | MISSING | P2 | — |
| GAP-040 | Admin | Refunds (F-603) | Audited refund updates access | Nothing | MISSING | P1 | — |
| GAP-041 | Admin | Revenue & commerce (F-605) | Net revenue, channels, orders | Placeholder | MISSING | P2 | `/admin/commerce` |
| GAP-042 | Cross | AI platform (F-700) | Adapter, policy, usage/cost | Nothing | MISSING | P2 | no AI SDK dependency |
| GAP-043 | Admin | AI management (F-704) | Policies, safety, usage, cost | Placeholder | MISSING | P2 | `/admin/ai` |
| GAP-044 | Cross | RAG ingestion (F-800) | Upload → processed/failed | Nothing | MISSING | P2 | — |
| GAP-045 | Cross | Permission-aware retrieval (F-801) | No cross-org/course leakage | Nothing | MISSING | P2 | — |
| GAP-046 | Admin | Knowledge base admin (F-802) | Test retrieval, re-index, delete | Placeholder | MISSING | P2 | `/admin/rag` |
| GAP-047 | Platform | Security headers & CSP (F-940) | Headers on every response | None configured | MISSING | P1 | `next.config.ts`, `proxy.ts` |
| GAP-048 | Platform | Rate limiting (F-941) | All SECURITY §18 endpoints | Signup, uploads, public catalog/search, analytics exports unlimited; limiter fails open | PARTIAL | P1 | `services/rate-limit/index.ts:7-16,42-60`; `auth/sign-up.ts` has no call |
| GAP-049 | Platform | Logging / correlation IDs (F-942) | Request-ID traced errors | `console.error` only | MISSING | P1 | no request-id / tracker in `src/` |
| GAP-050 | Platform | Privacy export & deletion (F-943) | User can export data and delete account | Nothing | MISSING | P1 | — |
| GAP-051 | Platform | Accessibility audit (F-944) | WCAG 2.2 AA audit passes | Not performed; no axe tooling | MISSING | P1 | no `axe` in tests/package.json |
| GAP-052 | Platform | Responsive audit (F-945) | 375/768/1024/1440 | E2E at 375 and 1440 only | PARTIAL | P2 | `playwright.config.ts:24-36` |
| GAP-053 | Platform | Performance budget (F-946) | Budgets met | Not defined or measured | MISSING | P2 | — |
| GAP-054 | Platform | CI & deployment (F-947) | Preview per PR, prod QA | No workflows | MISSING | P1 | no `.github/` |
| GAP-055 | Platform | Backups & recovery (F-948) | Tested restore | Nothing | MISSING | P1 | — |
| GAP-056 | Platform | Test hygiene | Suites skip cleanly without env | 2 suites crash without env | — (defect) | P3 | `tests/integration/courses-rls.test.ts:14` |
| GAP-057 | Admin | Role-aware admin nav (F-902) | Back-office roles see what they can use | All 18 entries shown to support/reviewer/org admin; pages then deny | — (UX gap) | P3 | `components/layout/portal-shell.tsx` (no permission filter) |
| GAP-058 | Instructor | Export error handling | Generic errors (SECURITY) | CSV export 500 returns raw error message | — (defect) | P3 | `app/instructor/analytics/export/route.ts:36-40` |
| GAP-059 | Instructor | Message-student result | Accurate delivery status | Returns "not delivered" when the notification is suppressed, though the thread message was stored | — (defect) | P3 | `features/instructor/student-actions.ts:31-46` |
| GAP-060 | Docs | Project state docs | MEMORY reflects reality | MEMORY "Current Status" says Phase 1 / next T-019; T-247 says "upgrade to Next 16" but 16.3.6 is installed | — (drift) | P3 | `docs/MEMORY.md:12-20`, `docs/TASKS.md` T-247 |

GAP-056 to GAP-060 are defects/drift, not registry features; they are excluded from the 98-feature
counts.

---

## 4. Missing Features

Every ⛔ feature above is also listed here with the required fields. Features that share a cause
are grouped.

**Instructor certificates (F-218)**
- Portal: Instructor. Expected: issued-certificate list for own courses + template settings.
- Current state: `/instructor/certificates` renders "Coming in T-110". Missing because no route
  file, query or template model exists (the `certificates` table has no template reference).
- Priority: P2. Dependencies: F-109 (exists).

**Resource library (F-219)**
- Portal: Instructor. Expected: reusable media/documents with usage count.
- Current state: placeholder (T-111). Lesson assets are stored per lesson (`lesson_assets`); there
  is no shared-asset entity. Priority: P2. Dependencies: storage adapter (exists).

**Instructor settings & public profile (F-220)**
- Portal: Instructor. Expected: public profile, payout details (via provider), notifications.
- Current state: placeholder (T-112). No instructor public profile page exists anywhere.
- Priority: P2. Dependencies: payout details depend on F-600/F-604.

**Instructor earnings & payouts (F-604)**
- Portal: Instructor. Expected: earnings matching paid orders − refunds/fees.
- Current state: placeholder (T-186); no `instructor_payouts`. Priority: P2.
  Dependencies: F-600, F-603.

**Instructor AI drafting / insights (F-702, F-703)**
- Portal: Instructor. Expected: editable AI drafts (never auto-published); review/drop-off insights.
- Current state: `/instructor/ai` placeholder; nothing for insights. Priority: P2.
  Dependencies: F-700; F-703 also needs F-216 data (exists) and F-217.

**Learner AI Tutor (F-701)**
- Portal: Learner. Expected: tutor contextual to the current lesson, with sources, hint-only during
  graded assessments.
- Current state: placeholder, but promoted in the sidebar and one of the four mobile bottom-bar
  slots. Priority: P2. Dependencies: F-700, F-801.

**Admin user detail (F-402)** — Admin. No `/admin/users/[id]`; user rows have no drill-down. No
session/login-history source exists. P2. Deps: F-401 (partial).

**Instructor management & verification (F-403)** — Admin. Placeholder (T-131/132). No instructor
application entity; instructor role is granted only via generic role change. P2. Deps: F-404,
F-604 for revenue.

**Roles & permissions matrix (F-404)** — Admin. Placeholder (T-133). Permissions are only
editable via SQL migrations. P2. Deps: none.

**Enrollments & cohorts (F-407)** — Admin. Placeholder (T-135); no cohort table; no admin
enroll/unenroll action. P2. Deps: F-500 for org cohorts.

**Assessment oversight (F-408)** — Admin. Placeholder (T-136). P2. Deps: GAP-002 (manual grading)
for meaningful averages.

**Content, media & SCORM (F-410)** — Admin. Placeholder (T-138). No SCORM runtime. P2.

**Communication (F-413)** — Admin. Placeholder (T-141). No email provider integration; in-app
notifications only. P2. Deps: user-supplied email provider (MEMORY notes the Supabase free-tier
mailer limit).

**Integrations & API (F-415)** — Admin. Placeholder (T-142). No API-key or webhook tables. P2.

**Platform settings & security (F-416)** — Admin. Placeholder (T-143). Password/MFA/session
policy is not configurable. P1. Deps: F-414 (`settings.changed` audit).

**Admin profile (F-417)** — Admin. No route. P3.

**Organizations domain (F-500–F-504)** — Admin/All. No tables, RLS, routes or SSO config. F-501 is
P1 because the `org_admin` role already exists and is granted admin-console access; the rest are
P2. Deps: F-500 → F-501/F-502/F-503; F-504 needs IdP config from the user.

**Commerce domain (F-600–F-603, F-605)** — Cross/Admin. No payment adapter, tables or webhook.
F-600 and F-603 are P1 (F-103's "Done when" requires paid enrollment); F-601, F-602, F-605 are P2.
Deps: payment-provider keys from the user (per CLAUDE.md "Blocked?").

**AI platform & admin AI (F-700, F-704)** — Cross/Admin. No SDK dependency, no `ai_*` tables. P2.
Deps: AI provider keys from the user.

**Knowledge base / RAG (F-800–F-802)** — Cross/Admin. No `knowledge_*` tables, no pgvector. P2.
Deps: F-700 (embeddings), F-500 (org scoping for F-801).

**Production hardening (F-940, F-942, F-943, F-944, F-946, F-947, F-948)** — Platform. None
started (Phase 12). F-940/942/943/944/947/948 are P1, F-946 P2.

---

## 5. Partially Implemented Features

| Feature | Implemented | Missing | Incomplete | Current limitation | Priority |
| --- | --- | --- | --- | --- | --- |
| **F-900** Foundation | scripts, lint, unit tests, TS strict | — | Next 16 installed but `eslint-config-next` 15.5 (T-247 open) | **`check` fails at HEAD** (typecheck + build) | P0 |
| **F-107** Assessments | 4 auto-graded types, timer, server grading, attempts, answer keys isolated | manual grading of essay/coding | — | Essay/coding attempts never reach `graded`; blocks completion + certificate | P0 |
| **F-103** Enrollment | free enrollment, prerequisites, idempotent, RLS | paid enrollment | — | price > 0 refused | P1 |
| **F-215** Messaging | instructor thread list, unread counts, send, mark read | learner messages UI | — | learners cannot read or reply in-app | P1 |
| **F-217** Reviews mgmt | list, distribution, reply/delete RPCs + UI (WIP) | — | T-109 unfinished | breaks build | P1 |
| **F-007** Authorization | portal guards (proxy + layouts), 11 permissions, RLS, MFA gate | org isolation, fine-grained reviewer/support perms | — | `org_admin` unscoped in admin console | P1 |
| **F-405** Courses & categories | status tabs, table/grid, search, bulk start-review/archive | categories CRUD | — | taxonomy fixed at seed time | P1 |
| **F-414** Audit logs | append-only, immutable trigger, filters, audited CSV export | login/security events, cert revocation, settings, content deletion | — | incomplete trail vs SECURITY §17 | P1 |
| **F-941** Rate limiting | 8 action buckets, per-IP + per-subject | signup, uploads, public APIs, analytics exports, AI | — | fails open on DB error or missing key | P1 |
| **F-112** Calendar | month/week/agenda; assignment due dates; attempts; certificates | assessment due dates, sessions | — | upcoming assessments cannot appear | P2 |
| **F-216** Instructor analytics | KPIs, trends, filters, lesson drop-off, question difficulty, scoped CSV | replay metric; real revenue | watch time approximated | revenue = list price × enrollments | P2 |
| **F-412** Platform analytics | daily enrollments/completions/signups, top courses | saved reports, export, scheduling | — | view-only | P2 |
| **F-945** Responsive | E2E at 375 and 1440 | 768, 1024 audit | — | tablet widths unverified | P2 |
| **F-401** User management | search, filters, create, invite, suspend/reinstate, role change (audited, escalation-guarded) | invite email delivery | — | admin must hand over the link | P3 |

---

## 6. Mock / Demo Implementations

**No hardcoded, static-JSON or fake-API data was found in application code.**

- `grep` for mock/fake/sample/lorem/demo in `src/` found no data fixtures.
- `scripts/seed.mjs` is the only fixture source, and `tests/unit/seed-isolation.test.ts` enforces
  that nothing under `src/` imports it (ADR-023).
- Unbuilt screens use `components/layout/placeholder-page.tsx`, which shows no fake data.
- Authentication, payments and AI are not simulated; they are either real (auth) or absent.

**Derived or estimated values presented as metrics.** These are not mock data, but they are not the
measurement the label implies:

| Screen | Displayed | Actual source | Note |
| --- | --- | --- | --- |
| Instructor Analytics → "Revenue", "Avg / student", per-course revenue, CSV | currency totals | `sum(course_versions.price_cents)` over enrollments (`20260926110000_instructor_analytics.sql:72,201`) | No payments exist and paid enrollment is refused, so real revenue is always 0. Non-zero values can only come from seeded/manual rows. |
| Instructor Analytics → watch time (lesson analytics / CSV) | minutes watched | `sum(lesson_progress.last_position_seconds)` | Resume position, not playback time. |
| Learner My Progress → Skills | skill + level | categories of courses with progress (`features/progress/progress.ts:90-110`) | A category proxy; there is no skills model. |

---

## 7. UI Without Functional Backend

| UI | Location | What happens |
| --- | --- | --- |
| Paid-course enrollment panel | `components/courses/enrollment-panel.tsx:73` | Message "Paid enrollment is not available yet. Checkout is coming soon." No action. |
| 20 navigation entries | see §9 | Route to "Coming in T-xxx" placeholder pages (these are MISSING features, not functional UI) |
| AI Tutor mobile bottom-bar slot | `config/navigation.ts` `mobileBar` | One of four primary mobile tabs opens a placeholder. |

No form, button or modal was found that pretends to succeed without a backend call. Buttons that
look disabled are disabled by real state (pending, empty selection, locked version).

---

## 8. Backend Functionality Without UI

| Backend capability | Evidence | Missing UI |
| --- | --- | --- |
| Certificate revocation state, immutable guard, `certificate_events` trigger; verify page renders "revoked" | `20260924100000_certificates.sql:23-81`, `app/certificates/verify/[id]/page.tsx:41-64` | No revoke action or admin screen (F-409) |
| Discussion reports + hide/restore; `can_moderate_discussions` grants `course.review` holders | `20260925130000_discussions.sql`, `set_discussion_hidden`, `resolve_discussion_reports` | Reachable only per course in the instructor portal; no admin moderation queue (F-411) |
| Learner side of direct messaging (RLS lets learners read threads, send, mark read) | `20260926100000_messaging.sql:44-67`, `get_thread_messages` | No learner messages route (F-215) |
| `app.audit_purge` permission | `20260924180000_audit_logs.sql:4` | Reserved for T-243 retention; no job |
| `rate_limit_hits` + `check_rate_limit` | `20260923140000_rate_limits.sql` | No admin view of limits or hits (F-415/F-416) |

---

## 9. Route audit

`[...section]` catch-alls in each portal serve every nav item without a real route file
(`dynamicParams = false`, so unknown paths 404).

### Public / auth

| Route | Expected | Exists | Functional | Status |
| --- | --- | --- | --- | --- |
| `/` | landing / role redirect | ✅ | ✅ | IMPLEMENTED |
| `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | auth | ✅ | ✅ | IMPLEMENTED |
| `/auth/callback` (route handler) | email/OTP exchange | ✅ | ✅ | IMPLEMENTED |
| `/mfa` | TOTP enrol/challenge | ✅ | ✅ | IMPLEMENTED |
| `/onboarding` | learner interests/goals | ✅ | ✅ | IMPLEMENTED |
| `/permission-denied` | denied page | ✅ | ✅ | IMPLEMENTED |
| `/courses`, `/courses/[slug]` | public catalog + detail | ✅ | ✅ | IMPLEMENTED |
| `/certificates/verify`, `/certificates/verify/[id]` | public verification | ✅ | ✅ | IMPLEMENTED |
| checkout / order routes, payment webhook | F-600 | ❌ | — | MISSING |
| SSO entry | F-504 | ❌ | — | MISSING |

### Learner (`/learner/*`)

| Route | Exists | Functional | Status |
| --- | --- | --- | --- |
| `/learner` dashboard | ✅ | ✅ | IMPLEMENTED |
| `/learner/my-learning` | ✅ | ✅ | IMPLEMENTED |
| `/learner/paths`, `/paths/[slug]` | ✅ | ✅ | IMPLEMENTED |
| `/learner/courses/[slug]` | ✅ | ✅ | IMPLEMENTED |
| `/learner/courses/[slug]/learn/[lessonId]` | ✅ | ✅ | IMPLEMENTED |
| `/learner/courses/[slug]/assessments/[assessmentId]` | ✅ | 🟡 essay/coding never graded | PARTIAL |
| `/learner/assessments` | ✅ | ✅ | IMPLEMENTED |
| `/learner/assignments`, `/assignments/[id]` | ✅ | ✅ | IMPLEMENTED |
| `/learner/calendar` | ✅ | 🟡 | PARTIAL |
| `/learner/discussions`, `/discussions/[id]` | ✅ | ✅ | IMPLEMENTED |
| `/learner/certificates` | ✅ | ✅ | IMPLEMENTED |
| `/learner/progress` | ✅ | ✅ | IMPLEMENTED |
| `/learner/notifications` | ✅ | ✅ | IMPLEMENTED |
| `/learner/settings` | ✅ | ✅ | IMPLEMENTED |
| `/learner/ai-tutor` | placeholder | ❌ | PLACEHOLDER |
| learner messages (F-215) | ❌ | — | MISSING |

### Instructor (`/instructor/*`)

| Route | Exists | Functional | Status |
| --- | --- | --- | --- |
| `/instructor` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/courses`, `/courses/new`, `/courses/[courseId]` | ✅ | ✅ | IMPLEMENTED |
| `…/basics`, `…/curriculum`, `…/lessons/[lessonId]`, `…/pricing` | ✅ | ✅ | IMPLEMENTED |
| `…/assessments`, `…/assessments/[assessmentId]` | ✅ | ✅ | IMPLEMENTED |
| `…/assignments`, `…/assignments/[assignmentId]` | ✅ | ✅ | IMPLEMENTED |
| `…/preview`, `…/preview/[lessonId]`, `…/readiness`, `…/submit` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/students`, `/students/[enrollmentId]` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/grading`, `/grading/[submissionId]` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/discussions`, `/discussions/[id]` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/messages` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/analytics`, `/analytics/export` (route) | ✅ | 🟡 | PARTIAL |
| `/instructor/question-bank` | ✅ | ✅ | IMPLEMENTED |
| `/instructor/reviews` | ✅ | ❌ build broken | PARTIAL (WIP) |
| `/instructor/notifications` | ✅ | ✅ | IMPLEMENTED (not in nav) |
| `/instructor/earnings`, `/certificates`, `/resources`, `/ai`, `/settings` | placeholder | ❌ | PLACEHOLDER ×5 |

### Admin (`/admin/*`)

| Route | Exists | Functional | Status |
| --- | --- | --- | --- |
| `/admin` | ✅ | ✅ | IMPLEMENTED |
| `/admin/users` | ✅ | ✅ (invite link manual) | PARTIAL |
| `/admin/courses`, `/courses/[courseId]`, `/courses/[courseId]/lessons/[lessonId]` | ✅ | ✅ | IMPLEMENTED |
| `/admin/analytics` | ✅ | 🟡 | PARTIAL |
| `/admin/audit`, `/audit/export` (route) | ✅ | ✅ | IMPLEMENTED |
| `/admin/roles`, `/instructors`, `/enrollments`, `/assessments`, `/certificates`, `/commerce`, `/content`, `/moderation`, `/notifications`, `/ai`, `/rag`, `/organizations`, `/integrations`, `/settings` | placeholder | ❌ | PLACEHOLDER ×14 |
| `/admin/users/[id]` (F-402), `/admin/instructors/[id]` (F-403), `/admin/profile` (F-417) | ❌ | — | MISSING |

**Route findings**

- Placeholder routes: **20** (learner 1, instructor 5, admin 14).
- Missing routes (no route and no placeholder): learner messages, admin user detail, admin
  instructor detail, admin profile, checkout/webhook, SSO.
- Duplicate routes: none. `/courses/[slug]` (public) and `/learner/courses/[slug]` (enrolled view)
  are intentionally separate.
- Broken routes: `/instructor/reviews` at HEAD (build fails).
- Unauthorized routes: none found. All three portal prefixes are guarded in `proxy.ts` **and** in
  each portal layout.
- Wrong-screen routes: none found.

---

## 10. Backend audit

| Feature | UI | API / server action / RPC | Database | Status |
| --- | --- | --- | --- | --- |
| Signup/login/reset/verify | YES | YES (`features/auth/*`) | YES (Supabase Auth + `profiles`) | IMPLEMENTED |
| Admin MFA | YES | YES (`auth/mfa.ts`) | YES (Supabase MFA) | IMPLEMENTED |
| Catalog search | YES | YES (`search_courses`) | YES | IMPLEMENTED |
| Free enrollment | YES | YES (`enrollInCourse`) | YES (`enrollments`) | IMPLEMENTED |
| Paid enrollment / checkout | YES (message only) | NO | NO | MISSING |
| Lesson completion & resume | YES | YES (`completeLesson`, `saveVideoPosition`) | YES (`lesson_progress`) | IMPLEMENTED |
| Assessment attempt + auto grading | YES | YES (`assessments/attempts.ts`) | YES | IMPLEMENTED |
| Essay/coding manual grading | NO | NO | status column only | MISSING |
| Certificate issue | YES | YES (`tryEvaluateCompletion`) | YES | IMPLEMENTED |
| Certificate revoke | NO | NO | YES (columns + triggers) | BACKEND ONLY (DB) |
| Assignments submit + grade | YES | YES (`submit_assignment`, `grade_assignment_submission`) | YES | IMPLEMENTED |
| Discussions | YES | YES | YES | IMPLEMENTED |
| Admin moderation queue | NO | partial (`resolve_discussion_reports`, `set_discussion_hidden`) | YES | BACKEND ONLY |
| Notifications | YES | YES (`services/notifications`) | YES | IMPLEMENTED (in-app only) |
| Email delivery | NO | NO | NO | MISSING |
| Course authoring (basics → submit) | YES | YES (`features/course-authoring/*`) | YES | IMPLEMENTED |
| Course review decisions | YES | YES (`transition.ts`, `apply_course_transition`) | YES | IMPLEMENTED |
| Publish / new draft version | YES | YES (`create_draft_version`) | YES | IMPLEMENTED |
| Instructor messaging | YES (instructor) / NO (learner) | YES | YES | PARTIAL |
| Instructor analytics + export | YES | YES (5 RPCs) | YES | PARTIAL |
| Instructor reviews reply | YES (WIP) | YES | YES | PARTIAL |
| Admin users | YES | YES (`user-actions.ts`, `set_user_roles`) | YES | IMPLEMENTED (invite email missing) |
| Categories CRUD | NO | NO | table exists | MISSING |
| Audit log | YES | YES (`recordAudit`, export route) | YES (append-only) | PARTIAL (coverage) |
| Roles matrix editing | NO | NO | tables exist | MISSING |
| Orgs / commerce / AI / RAG | placeholders | NO | NO | MISSING |

**Authorization pattern observed.** Server actions re-read the user with `auth.getUser()`, check
`can()` or ownership, validate input (zod / regex), then write through an RLS-bound client or a
`security definer` RPC that re-checks `has_permission` / `auth.uid()`. Admin-only writes use the
service role only after that check. No server action or route handler was found that skips
authentication.

---

## 11. Database audit

45 tables across 48 migrations. RLS is enabled on the domain tables inspected.

| Entity (required by FEATURES/PRD) | Status | Tables |
| --- | --- | --- |
| Users / profiles | ✅ | `profiles` |
| Roles / permissions | ✅ | `roles`, `permissions`, `role_permissions`, `user_roles` |
| Organizations / departments / teams | ⛔ | — |
| Courses / versions / sections / lessons / assets | ✅ | `courses`, `course_versions`, `course_sections`, `lessons`, `lesson_assets`, `course_prerequisites` |
| Categories | ✅ (no admin CRUD) | `categories` |
| Course review / lifecycle | ✅ | `course_submissions`, `course_reviews`, `course_review_notes`, `course_status_transitions` |
| Enrollments / progress / saved | ✅ | `enrollments`, `lesson_progress`, `saved_courses` |
| Learning paths | ✅ | `learning_paths`, `learning_path_courses`, `path_enrollments` |
| Cohorts | ⛔ | — |
| Assessments / questions / attempts | ✅ | `assessments`, `assessment_questions`, `assessment_options`, `assessment_answer_keys`, `assessment_attempts` |
| Question bank | ✅ | `question_bank_items` |
| Assignments / submissions | ✅ | `assignments`, `assignment_rubric_criteria`, `assignment_submissions` |
| Certificates | ✅ | `certificates`, `certificate_events` |
| Certificate templates | ⛔ | — |
| Reviews / ratings | ✅ | `course_ratings` |
| Discussions | ✅ | `discussions`, `discussion_posts`, `discussion_votes`, `discussion_reports` |
| Messaging | ✅ | `message_threads`, `direct_messages` |
| Notifications | ✅ | `notifications`, `notification_preferences` |
| Onboarding | ✅ | `learner_onboarding` |
| Audit logs | ✅ | `audit_logs` (immutable trigger) |
| Rate limiting | ✅ | `rate_limit_hits` |
| Orders / payments / refunds / coupons / subscriptions / payouts | ⛔ | — |
| AI conversations / messages / generation jobs | ⛔ | — |
| Knowledge documents / chunks | ⛔ | — |
| API keys / webhooks / request log | ⛔ | — |
| Instructor applications / resource library / SCORM packages | ⛔ | — |
| Announcements / email templates / delivery log | ⛔ | — |
| Platform settings / sessions / login history | ⛔ | — |
| Video playback events (for replay / true watch time) | ⛔ | — |

Storage buckets: `course-thumbnails`, `course-videos`, `lesson-assets`,
`assignment-submissions`, `avatars` (per `services/storage`).

---

## 12. Authentication & RBAC gap audit

| Check | Finding |
| --- | --- |
| Missing authentication | None found. `proxy.ts` matcher covers `/learner`, `/instructor`, `/admin`, `/courses`, `/certificates`; every portal layout re-checks. Route handlers check `getUser()`. |
| Missing role checks | Portal access enforced server-side by `portal.*.access`. |
| Missing permission checks | Fine-grained set is small (11 permissions). **Support agent and content reviewer have no explicit "cannot do X" permissions beyond what exists**; boundaries for unbuilt admin areas cannot be tested yet. |
| Frontend-only authorization | None found. The admin nav is **not** filtered by permission (UX only, since pages deny server-side). |
| Unprotected API | None found. The instructor CSV export checks only authentication in-handler (the proxy supplies the portal check and the RPC scopes to `instructor_id = auth.uid()`). |
| Unprotected server actions | None found in sampled actions (enrollment, progress, authoring, transitions, users, messaging, discussions). |
| Incorrect redirects | None found. `safeNextPath` guards open redirects. `org_admin` is routed to `/admin` (`roles.ts:8-14`) although no org scope exists. |
| **Missing organization isolation** | **Yes.** No org model. `org_admin` holds `portal.admin.access`, so it can open the admin console and the platform-wide `admin_overview` counts. |
| Email-verification enforcement | Depends on the Supabase "Confirm email" dashboard setting (documented ON in MEMORY; not codified). The proxy checks only that a user exists. |
| Rate-limiter behavior | Fails open when the service-role key is missing or the RPC errors (`services/rate-limit/index.ts:42-60`). |
| Known platform issue | Supabase leaked-password protection is OFF (MEMORY "Known issue"). |

---

## 13. Dynamic data audit

Every built screen was checked for hardcoded values:

| Screen | Data source | Dynamic? |
| --- | --- | --- |
| Learner dashboard (6 blocks) | `features/dashboard/data.ts` → profiles, onboarding, `my_learning`, attempts, catalog | YES |
| Catalog / detail | `search_courses`, `get_course_detail` | YES |
| My Learning / Progress / Calendar / Certificates / Notifications | RPCs + RLS tables | YES |
| Instructor overview / courses / students / analytics | `instructor_*` RPCs | YES (revenue/watch-time derived, §6) |
| Admin overview | `admin_overview` RPC, `course_versions`, `audit_logs` | YES |
| Admin analytics | `admin_analytics_daily`, `admin_top_courses` | YES |
| Admin users / courses / audit | `admin_users`, `admin_courses`, `audit_logs` | YES |

No hardcoded counts, static arrays of courses/users, fake progress or fake notifications were found.
Static arrays in `src/features/onboarding/options.ts` (interest/goal choices) and
`config/navigation.ts` are configuration, not data.

---

## 14. Feature completeness by layer (partial and representative features)

✓ = present · ✗ = absent · — = not applicable

| Feature | UI | Backend | DB | AuthN | AuthZ | Validation | Error handling | Persistence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Free enrollment (F-103) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Paid enrollment (F-103/F-600) | message only | ✗ | ✗ | — | — | — | — | ✗ |
| Assessments – auto (F-107) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Assessments – manual grading | ✗ | ✗ | status only | — | — | — | — | ✗ |
| Messaging – learner side (F-215) | ✗ | ✓ | ✓ | ✓ | ✓ (RLS) | ✓ | — | ✓ |
| Reviews mgmt (F-217) | ✓ (broken build) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Certificate revoke (F-409) | ✗ | ✗ | ✓ | — | — | — | — | ✓ |
| Moderation (F-411) | instructor only | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Categories (F-405) | ✗ | ✗ | ✓ | — | — | — | — | ✓ |
| Audit (F-414) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | never throws | ✓ (partial coverage) |
| User invite (F-401) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (no email) |
| Security headers (F-940) | — | ✗ | — | — | — | — | — | — |

---

## 15. Design vs implementation gaps

The prototypes are not in the repo (§0.3), so "UI matches design" compares against the element lists
in `MEMORY.md` and `DESIGN.md`, not visuals.

| Screen | Design exists | App screen | UI matches design | Functionality | Backend | Dynamic | Missing elements |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Learner** Dashboard | YES | YES | YES (6-block hierarchy, DESIGN §14) | YES | YES | YES | — |
| My Learning | YES | YES | YES | YES | YES | YES | — |
| Learning Path | YES | YES | YES | YES | YES | YES | — |
| Course Player | YES | YES | YES | YES | YES | YES | AI Tutor side panel (DESIGN §14 "contextual") |
| Quiz | YES | YES | PARTIAL | PARTIAL | YES | YES | result for essay/coding never finalises |
| Progress | YES | YES | YES | YES | YES | YES | real skills model |
| Calendar | YES | YES | PARTIAL | PARTIAL | YES | YES | scheduled assessments, sessions |
| Certificates | YES | YES | YES | YES | YES | YES | — |
| AI Tutor | YES | NO (placeholder) | NO | NO | NO | NO | entire screen |
| Notifications | YES | YES | YES | YES | YES | YES | email channel prefs |
| Assessments | YES | YES | YES | YES | YES | YES | — |
| Discussions | YES | YES | YES | YES | YES | YES | — |
| Assignments | YES | YES | YES | YES | YES | YES | — |
| **Instructor** Dashboard | YES | YES | YES | YES | YES | YES | — |
| My Courses | YES | YES | YES | YES | YES | YES | — |
| Create Course (guided) | YES | YES | PARTIAL | YES | YES | YES | DESIGN §15 flow is Basics→Curriculum→Content→Assessments→Pricing→Settings→Preview→Readiness→Submit; the stepper (`course-steps`, `steps.ts:22-27`) has 6 steps; Content and Assessments are reached from Curriculum, and Pricing+Settings are merged |
| Curriculum Builder | YES | YES | YES | YES | YES | YES | — |
| Lesson Editor | YES | YES | YES | YES | YES | YES | — |
| Assessment Builder | YES | YES | YES | YES | YES | YES | — |
| Assignment Builder | YES | YES | YES | YES | YES | YES | — |
| Question Bank | YES | YES | YES | YES | YES | YES | — |
| Course Preview | YES | YES | YES | YES | YES | YES | — |
| Course Readiness | YES | YES | YES | YES | YES | YES | — |
| Review Submission | YES | YES | YES | YES | YES | YES | — |
| Review Feedback | YES | YES | YES | YES | YES | YES | — |
| Student Management / Detail | YES | YES | YES | YES | YES | YES | — |
| Discussions | YES | YES | YES | YES | YES | YES | — |
| Messaging | YES | YES | PARTIAL | PARTIAL | YES | YES | learner counterpart |
| Analytics | YES | YES | PARTIAL | PARTIAL | YES | YES | replay; real revenue |
| Reviews | YES | YES (WIP) | UNKNOWN | PARTIAL | YES | YES | build broken |
| Earnings | YES | NO | NO | NO | NO | NO | entire screen |
| Certificates | YES | NO | NO | NO | NO | NO | entire screen |
| Resource Library | YES | NO | NO | NO | NO | NO | entire screen |
| AI Assistant | YES | NO | NO | NO | NO | NO | entire screen |
| Settings | YES | NO | NO | NO | NO | NO | entire screen |
| **Admin** Overview | YES | YES | YES | YES | YES | YES | revenue KPIs (no commerce) |
| Users | YES | YES | YES | YES | YES | YES | drill-down to detail |
| User Detail | YES | NO | NO | NO | NO | NO | entire screen |
| Courses | YES | YES | YES | PARTIAL | YES | YES | categories management |
| Course Review | YES | YES | YES | YES | YES | YES | — |
| Analytics | YES | YES | PARTIAL | PARTIAL | YES | YES | saved reports, export, revenue |
| Audit Logs | YES | YES | YES | YES | YES | YES | — |
| Instructors, Organizations, Roles & Permissions, Enrollments, Assessments, Certificates, Commerce, Content, Moderation, Notifications, AI, Knowledge Base, Integrations, Settings/Security, Profile | YES | NO (placeholder / none) | NO | NO | NO | NO | entire screens |

**States.** Built routes consistently ship `loading.tsx` / `error.tsx` and use `EmptyState` /
`PermissionDeniedState` from `components/feedback/states.tsx`. No missing-state gaps were found on
built screens. Unbuilt screens have none, because they don't exist.

---

## 16. Portal completeness

Completion = IMPLEMENTED ÷ features assigned to the portal (strict). A second figure counts PARTIAL
as ½ for reference. Feature-to-portal assignment:

- **Learner (20):** F-008, F-100–F-117, F-701.
- **Instructor (24):** F-200–F-220, F-604, F-702, F-703.
- **Admin (28):** F-005, F-400–F-417, F-500–F-504, F-603, F-605, F-704, F-802.
- **Cross-cutting (26):** F-001–F-004, F-006, F-007, F-310, F-600–F-602, F-700, F-800, F-801,
  F-900–F-903, F-940–F-948.

### Learner Portal

```text
Implemented:  16  (F-008, F-100, F-101, F-102, F-104, F-105, F-106, F-108, F-109, F-110,
                   F-111, F-113, F-114, F-115, F-116, F-117)
Partial:       3  (F-103, F-107, F-112)
Missing:       1  (F-701)
Mock:          0
UI-only:       0
Completion estimate: 16 / 20 = 80.0 %   (with partial as ½: 17.5 / 20 = 87.5 %)
```

### Instructor Portal

```text
Implemented:  15  (F-200 – F-214)
Partial:       3  (F-215, F-216, F-217)
Missing:       6  (F-218, F-219, F-220, F-604, F-702, F-703)
Mock:          0
UI-only:       0
Completion estimate: 15 / 24 = 62.5 %   (with partial as ½: 16.5 / 24 = 68.8 %)
```

### Admin Portal

```text
Implemented:   3  (F-005, F-400, F-406)
Partial:       4  (F-401, F-405, F-412, F-414)
Backend-only:  2  (F-409, F-411)
Missing:      19  (F-402, F-403, F-404, F-407, F-408, F-410, F-413, F-415, F-416, F-417,
                   F-500 – F-504, F-603, F-605, F-704, F-802)
Mock:          0
UI-only:       0
Completion estimate: 3 / 28 = 10.7 %   (with partial as ½: 5 / 28 = 17.9 %)
```

### Cross-cutting / platform

```text
Implemented:   9  (F-001, F-002, F-003, F-004, F-006, F-310, F-901, F-902, F-903)
Partial:       4  (F-007, F-900, F-941, F-945)
Missing:      13  (F-600, F-601, F-602, F-700, F-800, F-801, F-940, F-942, F-943, F-944,
                   F-946, F-947, F-948)
Completion estimate: 9 / 26 = 34.6 %
```

**Overall:** 43 / 98 = **43.9 %** implemented. With partial as ½: (43 + 7) / 98 = **51.0 %**.
Project ledger: 38 / 98 = 38.8 % (see §0.4).

---

## 17. Dependency gaps

```text
Certificate issuance (F-109) for courses with essay/coding questions
        ↓ depends on
Course completion rule (all assessments passed)
        ↓ depends on
Manual grading of essay/coding attempts   ← MISSING (GAP-002)
```

```text
Paid enrollment (F-103)            Instructor earnings (F-604)     Admin revenue (F-605)
        ↓                                   ↓                              ↓
        └──────────── Orders / payments / verified webhooks (F-600) ──────┘
                                    ↓
                     Payment adapter + provider keys (user-supplied)
Refunds (F-603), coupons (F-602), subscriptions (F-601) → F-600
Real instructor revenue KPI (F-216) → F-600
Instructor payout details (F-220) → F-600 / F-604
```

```text
Learner AI Tutor (F-701) ─┬─→ AI platform adapter/policy/usage (F-700) → AI provider keys (user)
                          └─→ Permission-aware retrieval (F-801) → Ingestion (F-800)
                                                                   → Organizations (F-500) for org scoping
Instructor AI (F-702, F-703), Admin AI (F-704), KB admin (F-802) → F-700 / F-800
```

```text
Scoped Org Admin (F-501), assigned learning (F-502), org reports (F-503), SSO (F-504),
org cohorts (F-407), full RBAC boundary set (F-007)
        ↓ depend on
Organizations / departments / teams + RLS (F-500)
```

```text
Certificate revocation audit (F-414 coverage) → Certificate admin UI/action (F-409)
settings.changed audit (F-414) → Platform settings (F-416)
Invite email (F-401), announcements (F-413), email notification channel (F-115) → email provider (F-413)
Admin moderation of reviews (F-411) → reportable reviews (not modelled)
Calendar assessments (F-112) → assessment due/scheduled dates (not modelled)
Video replay / true watch time (F-216) → playback event capture (not modelled)
Instructor E2E sign-off (T-113) → F-217 (build) + F-218/F-219/F-220
Admin E2E sign-off (T-145) → F-402 … F-417
Any deploy (F-947) → green build (GAP-001)
```

---

## 18. Recommended implementation order (dependency-based)

Adjusted to this repository's actual state and `TASKS.md` phase order:

```text
0. Restore a green build                 (GAP-001: finish/fix T-109; test env-guard hygiene)
        ↓
1. Close the core-loop break             (GAP-002: manual grading → completion → certificate)
        ↓
2. Finish instructor portal              (F-215 learner side, F-217, F-218, F-219, F-220 → T-113 E2E)
        ↓
3. Admin portal completion               (F-402 → F-404 → F-403 → F-405 categories → F-407 →
                                          F-408 → F-409 → F-410 → F-411 → F-412 → F-413 →
                                          F-414 coverage → F-415 → F-416 → F-417 → T-145 E2E)
        ↓
4. Organizations                          (F-500 → F-501 → F-502 → F-503 → F-504; closes F-007)
        ↓
5. Commerce                               (F-600 → F-103 paid → F-601/F-602 → F-603 → F-604 → F-605;
                                          makes F-216 revenue real)
        ↓
6. AI platform                            (F-700 → F-702/F-703 → F-704)
        ↓
7. Knowledge base / RAG                   (F-800 → F-801 → F-802 → wire F-701 AI Tutor)
        ↓
8. Production hardening                   (F-940, F-941, F-942, F-943, F-944, F-945, F-946,
                                          F-947, F-948)
```

Steps 4–7 need user-supplied inputs (IdP config, payment and AI provider keys), per CLAUDE.md
"Blocked?". Step 8 items F-940/F-947 have no dependencies and could run in parallel at any point.

---

## FINAL IMPLEMENTATION STATUS

The current LMS contains:

**Implemented (43):**
Signup/login, email verification, password reset, session/logout, admin MFA, roles & role-aware
routing, learner onboarding · Learner dashboard, catalog/search/filters, course detail, My Learning,
course player, lesson progress & resume, assignments, certificates, public certificate
verification, learning paths, discussions, progress & skills, notifications (in-app), profile &
settings, ratings & reviews · Instructor overview, My Courses, guided creation, curriculum builder,
lesson editor, assessment builder, assignment builder & grading, question bank, course preview,
readiness, submit for review, review feedback & resubmission, publish & versioning, students,
instructor discussions · Course state machine · Admin overview, course review workflow · Design
system, portal shells, dev seed isolation.

**Partially Implemented (14):**
Server-side authorization (no org isolation), enrollment (free only), assessments (no manual
grading), calendar (no assessment dates), messaging (no learner UI), instructor analytics (estimated
revenue, no replay), reviews management (WIP, build broken), user management (no invite email),
courses & categories (no categories CRUD), platform analytics (no saved reports/export), audit logs
(incomplete coverage), foundation/tooling (check fails), rate limiting (gaps, fails open),
responsive (2 of 4 widths).

**Mock/Demo (0):**
None. Estimated metrics are noted in §6: instructor revenue, watch time, skills.

**Backend Only (2):**
Certificate administration/revocation (DB only), moderation (instructor-side only, no admin queue).

**UI Only (0):**
None. 20 nav destinations are honest "Coming in T-xxx" placeholders, counted as Missing.

**Missing (39):**
Instructor certificates, resource library, instructor settings, instructor earnings, instructor AI
drafting, instructor AI insights, learner AI Tutor · Admin user detail, instructor management,
roles & permissions matrix, enrollments & cohorts, assessment oversight, content/SCORM,
communication, integrations & API, platform settings & security, admin profile · Organizations,
scoped org admin, assigned learning, org reports, SSO · Checkout/payments, subscriptions, coupons,
refunds, admin revenue · AI platform, admin AI management · RAG ingestion, retrieval, KB admin ·
Security headers/CSP, logging/correlation IDs, privacy export & deletion, accessibility audit,
performance budget, CI & deployment, backups & recovery.

**Blocked (0 features):**
Runtime verification is blocked for all features: no Supabase credentials (42 integration suites
skipped, 55 E2E specs not run), and the prototype source files are not in the repo.

The following items are required before the LMS can be considered feature-complete
(`npm run features:strict` passing):

1. A green `npm run check` at HEAD (fix the T-109 type errors and the two env-unguarded test suites).
2. Manual grading for essay/coding attempts, so every course type can complete and issue certificates.
3. The remaining instructor (T-109–T-113) and admin (T-130–T-145) tasks: 5 instructor and 14 admin
   placeholder screens, the learner messaging counterpart, categories CRUD, certificate revocation
   UI, admin moderation, and full SECURITY §17 audit coverage.
4. The four absent domains: organizations (F-500–F-504), commerce (F-600–F-605, which unlocks paid
   enrollment and real revenue), AI (F-700–F-704) and RAG (F-800–F-802). All need user-supplied
   provider credentials or configuration.
5. Phase 12 hardening: security headers/CSP, complete rate limiting, structured logging, privacy
   export/deletion, WCAG and responsive audits, performance budget, CI/preview deploys, and a
   tested backup/restore. Then run integration and E2E suites against a live project to confirm
   every "Implemented" row at runtime.

**The application is not production-ready.** The build fails at HEAD, there are no CI, security
headers or backups, and 39 of 98 registered features are absent.

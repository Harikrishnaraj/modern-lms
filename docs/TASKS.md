# Modern LMS — Tasks

Work one task at a time, **top to bottom**: implement → test → review → tick → commit → next.
Every task implements one or more features in `docs/FEATURES.md` (the `F-` IDs). A feature is
**complete** only when every task that lists it is ticked. `npm run features` shows coverage;
`npm run features:strict` fails until every feature is complete.

Legend: `[x]` done · `[ ]` todo · `[~]` in progress
Rules for editing this file: never delete a task or a feature reference to "finish faster";
if a task must split, keep its ID on the first part and add new IDs (e.g. T-036a).

---

## Phase 0 — Foundation ✅

- [x] **T-001** Next.js app (App Router, `src/`, TS strict, Tailwind v4, ESLint). — F-900
- [x] **T-002** Prettier, typecheck/format/test scripts. — F-900
- [x] **T-003** `.env.example`, secret-safe `.gitignore`, README. — F-900
- [x] **T-004** Design tokens from DESIGN.md, self-hosted fonts, reduced motion. — F-901
- [x] **T-005** Base UI components (Button, Input, Card, Badge, StatusBadge, Skeleton, states, PageHeader). — F-901
- [x] **T-006** Three portal shells with URL routing + lucide icons. — F-902
- [x] **T-007** Temporary landing page. — F-902
- [x] **T-008** Vitest + unit tests. — F-900
- [x] **T-009** Playwright config + smoke tests (375 / 1440). — F-900
- [x] **T-010** Course status state machine (ADR-010) + tests. — F-310

## Phase 1 — Authentication & roles

- [x] **T-011** Add `@supabase/ssr`, `@supabase/supabase-js`, `zod`; `src/lib/supabase/{server,client,middleware}.ts`. — F-001
- [x] **T-012** Migration: `profiles`, `roles`, `permissions`, `role_permissions`, `user_roles` + RLS "read own profile"; seed the 7 roles (SECURITY §3). — F-006
- [x] **T-013** Signup UI (email, password, confirm) with zod validation, loading/error states. — F-001
- [x] **T-014** Signup → Supabase Auth + `/verify-email`. — F-001, F-002
- [x] **T-015** Login UI + wiring; safe error on bad credentials; suspended users blocked. — F-001
- [x] **T-016** Logout + session refresh in middleware; expired session redirects to login. — F-004
- [x] **T-017** Forgot/reset password. — F-003
- [x] **T-018** Server-side role lookup + role-aware redirect after login; remove temporary landing links. — F-006
- [x] **T-019** Route guards for `/learner`, `/instructor`, `/admin` (middleware + layout) + permission-denied page; `can(user, permission)` helper with tests. — F-006, F-007
- [x] **T-020** Admin MFA (TOTP enrol + challenge; admin routes require AAL2). — F-005
- [x] **T-021** Rate-limit login/reset/verify endpoints. — F-941
- [x] **T-022** Learner onboarding (interests, goals) after first login. — F-008
- [x] **T-023** Tests: auth unit + E2E (TEST_PLAN §3, §4). — F-001…F-007

## Phase 2 — Learner core loop

- [x] **T-030** Migration: `courses`, `course_versions`, `course_sections`, `lessons`, `lesson_assets`, `categories`, `enrollments`, `lesson_progress` + RLS. — F-101
- [x] **T-031** Dev seed script (fixtures only, never imported by app code). — F-903
- [x] **T-032** Public catalog `/courses`: Postgres full-text search, filters (category, level, language, duration, price, rating), sort, pagination. — F-101
- [x] **T-033** Course detail `/courses/[slug]`: outcomes, curriculum preview, instructor, reviews summary. — F-102
- [x] **T-034** `enrollInCourse` service + Enroll button (free courses). — F-103
- [x] **T-035** My Learning (in progress / completed / saved) with empty state. — F-104
- [x] **T-036** Course player: curriculum sidebar, lesson content, prev/next, locked lessons, distraction-free layout. — F-105
- [x] **T-037** `completeLesson` + progress persistence; video resume position. — F-105, F-106
- [x] **T-038** Assessments schema (`assessments`, `assessment_questions`, `assessment_options`, `assessment_attempts`); learner API never returns answer keys. — F-107
- [x] **T-039** Assessment player (MCQ, multi-select, true/false, short answer), timer, server grading, pass/fail, retry rules. — F-107
- [x] **T-040** Course completion rule + `issueCertificate` (unique immutable ID). — F-109
- [x] **T-041** Learner Certificates page + public `/certificates/verify/[id]` (no private data). — F-109, F-110
- [x] **T-042** Learner dashboard from real data: greeting, continue learning, today's learning, active path, upcoming assessments, recommendations. — F-100
- [x] **T-043** Learner Assessments list (upcoming / completed / results). — F-107
- [x] **T-044** E2E: full learner journey (TEST_PLAN §5–§7, §9). — F-100…F-110

## Phase 3 — Instructor core loop

- [x] **T-050** Instructor Overview + My Courses (own courses only, by status, filters). — F-200, F-201
- [x] **T-051** Create Course step 1 — Basics (title, subtitle, category, level, language, thumbnail) → draft. — F-202
- [x] **T-052** Curriculum Builder: sections + lessons/quiz/assignment items CRUD, drag reorder + keyboard/menu alternative. — F-203
- [x] **T-053** Lesson Editor: sanitized rich text, video (upload via storage adapter or URL), attachments, preview flag. — F-204
- [x] **T-054** Assessment Builder: question types incl. essay/coding, points, pass mark, attempts, time limit. — F-205
- [x] **T-055** Pricing & Settings step (free/paid, certificate on/off, prerequisites, visibility). — F-202
- [x] **T-056** Course Preview as learner. — F-208
- [x] **T-057** Readiness checklist (pure rules + UI linking to failing sections). — F-209
- [x] **T-058** `submitCourseForReview` + submission screen with notes to reviewer. — F-210
- [x] **T-059** Course Overview page (status, stats, quick links to every builder step). — F-201
- [x] **T-060** E2E: instructor journey (TEST_PLAN §10). — F-200…F-210

## Phase 4 — Admin core loop

- [x] **T-070** `audit_logs` (append-only; insert-only RLS) + `recordAudit()` used by every privileged action. — F-414
- [x] **T-071** Admin Overview: KPIs, pending actions, platform activity. — F-400
- [x] **T-072** Courses list (status tabs, table/grid, search, filters, bulk actions). — F-405
- [x] **T-073** Course Review screen: inspect version, review checklist, reviewer notes per section. — F-406
- [x] **T-074** Approve / request changes / reject / publish / archive transitions (audited). — F-406, F-310
- [x] **T-075** Instructor sees review status + section-linked feedback; resubmit; previous versions auditable. — F-211
- [x] **T-076** Users list: search, filters, add, invite, suspend, role change (audited). — F-401
- [x] **T-077** Basic platform analytics (enrollments, completions over time). — F-412
- [x] **T-078** Audit Log screen: filter by actor/action/resource/date, export. — F-414
- [x] **T-079** E2E: admin review + user management (TEST_PLAN §13). — F-400…F-414

## Phase 5 — Learner complete

- [x] **T-080** Learning Paths: schema (`learning_paths`, `learning_path_courses`), catalog, detail, enroll in path, path progress. — F-111
- [x] **T-081** Assignments: `assignments`, `assignment_submissions`; learner list, submit (validated upload), status, feedback, lock after deadline. — F-108
- [x] **T-082** Calendar: deadlines, assessments, sessions (month/week/agenda). — F-112
- [x] **T-083** Discussions: `discussions`, `discussion_posts`; per-course threads, reply, upvote, mark answered, report. — F-113
- [x] **T-084** My Progress: hours, streak, completion by course, skills. — F-114
- [x] **T-085** Notifications: `notifications` model, bell + page, read/unread, preferences. — F-115
- [x] **T-086** Learner profile & settings (name, avatar, password, notification preferences). — F-116
- [x] **T-087** Course reviews: rate/review a completed course. — F-117
- [x] **T-088** E2E: paths, assignments, discussions, notifications (TEST_PLAN §8). — F-108, F-111…F-117

## Phase 6 — Instructor complete

- [x] **T-100** Assignment Builder (instructions, rubric, due date, file rules) + grading queue. — F-206
- [x] **T-101** Question Bank: reusable questions, tags, import into assessments. — F-207
- [x] **T-102** Publish approved course + new draft version from published (ADR-011). — F-212
- [x] **T-103** Students: list across courses, filters, progress segments (just enrolled / started / on track / at risk / completed). — F-213
- [x] **T-104** Student Detail: progress by lesson, attempts, submissions, message. — F-213
- [x] **T-105** Instructor Discussions: queue of unanswered, reply, pin, moderate. — F-214
- [x] **T-106** Messaging: 1:1 threads with learners, unread counts. — F-215
- [x] **T-107** Analytics overview: enrollments, completion rate, active learners, revenue KPIs, date + course filters. — F-216
- [x] **T-108** Learner, video (watch time, replay, drop-off by lesson) and assessment analytics (pass rate, avg attempts, question difficulty) + CSV export scoped to own courses. — F-216
- [x] **T-109** Reviews: ratings list, distribution, reply to review. — F-217
- [x] **T-110** Certificates: issued for my courses, certificate template settings. — F-218
- [x] **T-111** Resource Library: reusable media/documents with usage. — F-219
- [x] **T-112** Instructor Settings: public profile, payout details (via provider), notifications. — F-220
- [x] **T-113** E2E: instructor extended (TEST_PLAN §11, §12). — F-206…F-220
- [x] **T-114** Assignments page: create across courses (rich-text description, allowed file types, reference files up to 50MB), add to live courses (ADR-030), all-course table with status, submissions/enrolled, search and actions. — F-206

## Phase 7 — Admin complete

- [x] **T-130** User Detail: account, roles, progress by course, skills, sessions & devices, login history, actions. — F-402
- [x] **T-131** Instructors: list, verification queue (approve/reject applications), top instructors. — F-403
- [x] **T-132** Instructor Detail: courses, revenue, rating distribution, payouts. — F-403
- [x] **T-133** Roles & Permissions matrix editor (audited; cannot remove last Super Admin). — F-404
- [x] **T-134** Categories management. — F-405
- [x] **T-135** Enrollments & cohorts: search, manual enroll/unenroll, cohort create, bulk assign. — F-407
- [x] **T-136** Assessments: averages, question-quality flags, attempt investigation/reset. — F-408
- [x] **T-137** Certificates: search, revoke (audited), reissue. — F-409
- [x] **T-138** Content: media, documents, SCORM package upload + launch (validated). — F-410
- [x] **T-139** Moderation: reported posts/reviews queue, hide/restore, ban. — F-411
- [x] **T-140** Analytics: platform dashboards, saved reports, scheduled export. — F-412
- [x] **T-141** Communication: announcements (targeted), email templates, delivery log. — F-413
- [x] **T-142** Integrations & API: API keys (hashed, scoped), webhooks, rate limits, request log. — F-415
- [x] **T-143** Settings & Security: platform settings, password/MFA policy, session policy, security events. — F-416
- [x] **T-144** Admin profile: personal info, security, notification preferences, my recent actions. — F-417
- [x] **T-145** E2E: admin extended. — F-402…F-417

## Phase 8 — Organizations / enterprise

- [x] **T-160** `organizations`, `departments`, `teams`, `organization_members` + RLS isolation tests. — F-500
- [x] **T-161** Admin Organizations screen: create, members, learning hours. — F-500
- [x] **T-162** Org Admin scoped portal access (own org only). — F-501
- [x] **T-163** Assigned courses/paths + required completion + due dates. — F-502
- [x] **T-164** Organization reports (completion, overdue, hours) + export. — F-503
- [x] **T-165** Organization SSO (SAML/OIDC via Supabase). — F-504
- [x] **T-166** E2E: org isolation (TEST_PLAN §4, §13). — F-500…F-504

## Phase 9 — Commerce

- [ ] **T-180** Payment adapter interface + provider implementation (ADR-015). — F-600
- [ ] **T-181** `orders`, `payments`: checkout for paid course; enrollment only after verified webhook. — F-600
- [ ] **T-182** Webhook handler: signature, event ID idempotency, success/failure/refund events. — F-600
- [ ] **T-183** Subscriptions (plans, entitlement checks, cancel). — F-601
- [ ] **T-184** Coupons (percent/fixed, limits, expiry). — F-602
- [ ] **T-185** Refunds (admin-initiated, audited, revokes access per policy). — F-603
- [ ] **T-186** Instructor earnings + payouts (`instructor_payouts`). — F-604
- [ ] **T-187** Admin Commerce/Revenue: net revenue, by channel, orders table. — F-605
- [ ] **T-188** Tests: TEST_PLAN §14. — F-600…F-605

## Phase 10 — AI

- [ ] **T-200** AI provider adapter + policy service + usage/cost recording (`ai_conversations`, `ai_messages`, `ai_generation_jobs`). — F-700
- [ ] **T-201** Learner AI Tutor: contextual to current course/lesson, shows sources, refuses unsupported, hint-only during graded assessments, escalate to discussion. — F-701
- [ ] **T-202** Instructor AI: outline, objectives, summaries, quiz questions, assignment ideas — editable drafts, never auto-published. — F-702
- [ ] **T-203** Instructor AI insights: review summaries, drop-off patterns, improvement suggestions. — F-703
- [ ] **T-204** Admin AI management: model/policy config, safety controls, usage & cost, generation job history. — F-704
- [ ] **T-205** Tests: TEST_PLAN §15, §16. — F-700…F-704

## Phase 11 — Knowledge base / RAG

- [ ] **T-220** `knowledge_documents`, `knowledge_chunks` (pgvector) + RLS by org/course. — F-800
- [ ] **T-221** Upload + background pipeline: validate → extract → chunk → embed; status + failed documents view. — F-800
- [ ] **T-222** Permission-aware retrieval service (search constrained to allowed IDs before ranking). — F-801
- [ ] **T-223** Admin Knowledge Base: sources, test retrieval, re-index, delete removes from retrieval. — F-802
- [ ] **T-224** Wire AI Tutor to retrieval. — F-701, F-801
- [ ] **T-225** Tests: TEST_PLAN §17. — F-800…F-802

## Phase 12 — Production hardening & launch

- [x] **T-240** Security headers + CSP (SECURITY §22). — F-940
- [x] **T-241** Rate limiting for public/AI/upload/assessment endpoints. — F-941
- [x] **T-242** Structured logging + correlation IDs + error tracking. — F-942
- [x] **T-243** Privacy: data export, account deletion workflow, retention jobs. — F-943
- [x] **T-244** Accessibility audit (WCAG 2.2 AA) + fixes. — F-944
- [x] **T-245** Responsive audit at 375 / 768 / 1024 / 1440 for every screen. — F-945
- [x] **T-246** Performance pass (bundle size, LCP, query counts, lazy chart/editor loading). — F-946
- [x] **T-247** Upgrade to Next.js 16 / ESLint 10 when stable for this stack. — F-900
- [~] **T-248** CI (GitHub Actions: check + E2E) + preview deployments per PR on the VPS (ADR-036; CI done, previews to do). — F-947
- [x] **T-249** Backups + tested restore runbook. — F-948
- [ ] **T-250** Production deploy on the VPS (ADR-036, `docs/DEPLOY.md`) + full production QA checklist (TEST_PLAN §23). — F-947
- [x] **T-251** Fix the failing E2E specs found by the first full live run (accessibility, admin analytics/certificates/content/instructor-detail/integrations/moderation/profile, admin journey) and make the suite reliable in CI by running it against a local Supabase stack per job (ADR-034, user decision 2026-10-02), so CI E2E is green. — F-947

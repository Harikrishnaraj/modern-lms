# Modern LMS — Architecture

## 1. Architectural Summary

Use a **modular monolith** for the first production architecture.

Recommended stack:

- Frontend: Next.js + React + TypeScript
- Styling: Tailwind CSS
- UI primitives: shadcn/ui-style reusable components
- Backend: Next.js Server Actions and Route Handlers
- Database: PostgreSQL via Supabase
- Authentication: Supabase Auth
- Authorization: application RBAC + PostgreSQL Row Level Security
- Object storage: Supabase Storage initially
- Background jobs: a queue/job provider introduced when asynchronous workloads require it
- Payments: provider behind a service interface
- Email: transactional email provider behind a service interface
- E2E: Playwright
- Unit/integration: Vitest where useful
- Deployment: Ubuntu VPS with Docker: Next.js standalone server behind Caddy (automatic HTTPS), deployed from GitHub Actions over SSH after CI passes (ADR-036, `docs/DEPLOY.md`)
- Version control: Git + GitHub

This follows the supplied Vibe Coding guide's recommended beginner-to-production direction: Next.js, TypeScript, Tailwind CSS, PostgreSQL/Supabase, Supabase Auth, Git/GitHub, Playwright and Vercel.

## 2. Why Modular Monolith

Do not begin with microservices.

The LMS has many domains, but the early product needs:
- Fast iteration.
- Shared transactions.
- Simple local development.
- Simple deployment.
- Fewer network boundaries.
- Fewer duplicated types.
- Easier AI-assisted coding.

Domains should be isolated in code so they can later become services if scale or organizational boundaries justify it.

## 3. High-Level Architecture

```text
Browser
  |
  v
Next.js App Router
  |
  +--> Server Components / UI
  |
  +--> Server Actions
  |
  +--> Route Handlers / APIs
          |
          +--> Auth / Authorization
          |
          +--> Domain Services
                    |
                    +--> Learner
                    +--> Instructor
                    +--> Admin
                    +--> Courses
                    +--> Learning
                    +--> Assessments
                    +--> Certificates
                    +--> Commerce
                    +--> Organizations
                    +--> Notifications
                    +--> AI
                    +--> Analytics
                    +--> Audit
                    |
                    v
                PostgreSQL
                    |
             Supabase Storage
```

External services are accessed through adapters rather than directly from UI components.

## 4. Application Layers

### Presentation

Contains:
- Routes.
- Layouts.
- Server/client components.
- Forms.
- Tables.
- Charts.
- Dialogs.
- Design system components.

Presentation must not contain database queries or authorization rules.

### Application Services

Coordinates use cases.

Examples:
- `enrollInCourse`
- `completeLesson`
- `submitAssessment`
- `issueCertificate`
- `submitCourseForReview`
- `approveCourse`
- `createOrganizationUser`

### Domain

Contains business rules and domain types.

Examples:
- Course state transitions.
- Enrollment rules.
- Certificate eligibility.
- Assessment grading.
- Permission policies.

### Infrastructure

Contains:
- Supabase client.
- Repositories.
- Storage adapter.
- Payment adapter.
- Email adapter.
- AI provider adapter.
- Analytics adapter.

## 5. Recommended Folder Structure

```text
src/
├── app/
│   ├── (public)/
│   ├── (auth)/
│   ├── learner/
│   ├── instructor/
│   ├── admin/
│   ├── api/
│   └── layout.tsx
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── tables/
│   ├── charts/
│   └── feedback/
│
├── features/
│   ├── auth/
│   ├── users/
│   ├── courses/
│   ├── learning/
│   ├── assessments/
│   ├── assignments/
│   ├── certificates/
│   ├── discussions/
│   ├── organizations/
│   ├── commerce/
│   ├── notifications/
│   ├── analytics/
│   ├── ai/
│   ├── content/
│   └── audit/
│
├── services/
│   ├── auth/
│   ├── payments/
│   ├── email/
│   ├── storage/
│   ├── ai/
│   └── analytics/
│
├── lib/
│   ├── supabase/
│   ├── validation/
│   ├── permissions/
│   ├── logging/
│   └── utils/
│
├── types/
└── config/
```

Tests:

```text
tests/
├── unit/
├── integration/
└── e2e/
```

The supplied guide recommends separating app, components, features, services, lib, types and utils, with unit/integration/e2e test areas.

## 6. Route Architecture

### Public

```text
/
 /courses
 /courses/[courseSlug]
 /paths
 /paths/[pathSlug]
 /instructors/[slug]
 /certificates/verify/[certificateId]
 /pricing
```

### Auth

```text
/login
/signup
/verify-email
/forgot-password
/reset-password
/mfa
```

### Learner

```text
/learner
/learner/my-learning
/learner/paths
/learner/courses/[courseId]
/learner/courses/[courseId]/learn/[lessonId]
/learner/assessments
/learner/assignments
/learner/calendar
/learner/discussions
/learner/certificates
/learner/progress
/learner/ai-tutor
/learner/notifications
```

### Instructor

```text
/instructor
/instructor/courses
/instructor/courses/new
/instructor/courses/[courseId]
/instructor/courses/[courseId]/curriculum
/instructor/courses/[courseId]/lessons/[lessonId]
/instructor/courses/[courseId]/assessments
/instructor/courses/[courseId]/preview
/instructor/courses/[courseId]/readiness
/instructor/courses/[courseId]/submit
/instructor/students
/instructor/discussions
/instructor/messages
/instructor/analytics
/instructor/reviews
/instructor/earnings
/instructor/certificates
/instructor/resources
/instructor/question-bank
/instructor/ai
/instructor/settings
```

### Admin

```text
/admin
/admin/users
/admin/users/[userId]
/admin/roles
/admin/profile
/admin/instructors
/admin/instructors/[instructorId]
/admin/organizations
/admin/courses
/admin/courses/[courseId]/review
/admin/enrollments
/admin/assessments
/admin/certificates
/admin/commerce
/admin/content
/admin/moderation
/admin/analytics
/admin/notifications
/admin/ai
/admin/rag
/admin/audit
/admin/integrations
/admin/settings
```

## 7. Core Database Model

Primary entities:

```text
profiles
roles
permissions
role_permissions
organizations
organization_members
courses
course_versions
course_sections
lessons
lesson_assets
learning_paths
learning_path_courses
enrollments
lesson_progress
assessment_attempts
assessments
assessment_questions
assessment_options
assignments
assignment_submissions
certificates
discussions
discussion_posts
notifications
media_assets
orders
subscriptions
payments
refunds
coupons
instructor_payouts
reviews
ai_conversations
ai_messages
ai_generation_jobs
knowledge_documents
knowledge_chunks
audit_logs
```

## 8. Important Relationships

```text
Organization
  └── OrganizationMember
        └── Profile

Profile
  ├── Learner
  ├── Instructor
  └── Admin role

Instructor
  └── Course
        ├── CourseVersion
        ├── Section
        │    └── Lesson
        │         └── Asset
        ├── Assessment
        └── Assignment

Learner
  └── Enrollment
        └── LessonProgress

Enrollment
  └── AssessmentAttempt

Course
  └── Certificate eligibility
```

## 9. Course Versioning

Never overwrite published course content destructively.

Use:

```text
Course
  ├── Version 1 — published
  ├── Version 2 — draft
  └── Version 3 — in review
```

A published learner should remain tied to the relevant published version when necessary for auditability and certificate history.

## 10. Authorization

Use defense in depth:

1. Route protection.
2. Server-side role checks.
3. Service-level authorization.
4. Database RLS.

Do not trust client-side role state.

Example:

```text
UI hides Admin action
        +
Server checks permission
        +
Database policy limits data
```

## 11. State Machines

Business state transitions should be explicit functions.

Example:

```text
submitCourse()
approveCourse()
requestCourseChanges()
rejectCourse()
publishCourse()
archiveCourse()
```

Do not let arbitrary UI code update status strings.

## 12. Data Fetching

Use server-side fetching for protected application data where practical.

Client state should be reserved for:
- Form state.
- UI state.
- Temporary optimistic state.
- Interactive local state.

Persistent state belongs in PostgreSQL.

## 13. Caching and Revalidation

Cache:
- Public course catalog data where safe.
- Public course landing pages.
- Categories.
- Learning path metadata.

Do not broadly cache:
- Personal progress.
- Admin operational data.
- Permission-sensitive information.
- Payment state.

Revalidate after mutations.

## 14. File Storage

Store files in object storage, not PostgreSQL blobs.

Metadata belongs in `media_assets`.

Store:
- Storage key.
- MIME type.
- Size.
- Owner.
- Entity reference.
- Processing status.
- Checksum where useful.

For video, create a provider abstraction so a future Mux/Cloudflare/other video service can replace the initial storage implementation.

## 15. Background Work

Use asynchronous jobs for:
- Video processing.
- Email delivery.
- Certificate generation.
- AI generation.
- RAG indexing.
- Analytics aggregation.
- Scheduled reports.
- Bulk notifications.

Do not make a normal page request wait for long-running work.

## 16. Analytics Architecture

Capture product events such as:

```text
course_viewed
enrollment_started
course_enrolled
lesson_started
lesson_completed
assessment_started
assessment_submitted
course_completed
certificate_issued
ai_tutor_used
course_reviewed
```

Store event identity, actor, timestamp, resource and useful metadata.

Create aggregate queries/materialized views later when performance requires them.

## 17. Search

Start with PostgreSQL search for:
- Courses.
- Users.
- Organizations.
- Certificates.
- Orders.

Add a dedicated search engine only when measured requirements justify it.

## 18. AI / RAG

Separate:

```text
AI application service
    |
    +-- provider adapter
    |
    +-- retrieval service
    |
    +-- policy service
    |
    +-- usage/cost tracking
```

Knowledge pipeline:

```text
Document
 → validation
 → extraction
 → chunking
 → embedding
 → vector storage
 → retrieval
 → context assembly
 → model
 → response
```

AI must not bypass application authorization when retrieving course/organization content.

## 19. Observability

Production should have:
- Structured logs.
- Error tracking.
- Request correlation IDs.
- Audit logs for privileged actions.
- Performance monitoring.
- Database monitoring.
- Uptime monitoring.

The supplied guide explicitly treats monitoring, error tracking, analytics, performance monitoring and database backups as part of the production lifecycle.

## 20. Architecture Rules

1. UI components do not query the database.
2. UI components do not contain authorization logic.
3. Business logic lives in application/domain services.
4. Database access lives behind repositories/services where appropriate.
5. Server-side authorization is mandatory.
6. Never trust client role values.
7. Do not duplicate domain logic between learner/instructor/admin.
8. Use shared types and validation schemas.
9. Use explicit state transitions.
10. Avoid premature microservices.
11. Keep external providers behind adapters.
12. Prefer small vertical slices over layer-by-layer implementation.

The guide specifically recommends separating UI/database/business logic and building complete vertical slices rather than finishing the entire frontend or backend independently.

## 21. Deployment Architecture

```text
GitHub
  |
  v
Preview deployment
  |
  v
QA
  |
  v
Production
```

Environments:
- Local
- Preview/Staging
- Production

Each environment has separate secrets and database configuration.

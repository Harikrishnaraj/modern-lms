# Modern LMS — Test Plan

## 1. Testing Philosophy

The application is considered working only when:
- behavior is correct,
- permissions are correct,
- UI states are correct,
- responsive layouts work,
- accessibility is acceptable,
- production builds succeed,
- security boundaries hold.

The supplied Vibe Coding guide recommends linting, type checking, unit tests, integration tests, E2E tests and production build checks.

## 2. Test Layers

### Unit

Test:
- domain rules,
- validators,
- permission functions,
- status transitions,
- grading,
- certificate eligibility,
- formatting utilities.

### Integration

Test:
- database operations,
- server actions,
- API handlers,
- authorization,
- RLS,
- payment webhook processing,
- AI retrieval permissions.

### E2E

Test real user journeys with Playwright.

### Visual / Responsive

Test key screens at:
- 375px
- 768px
- 1024px
- 1440px

## 3. Authentication Tests

### Signup

- [ ] Valid learner can sign up.
- [ ] Duplicate email is rejected safely.
- [ ] Invalid email is rejected.
- [ ] Weak password is rejected.
- [ ] Verification flow works.

### Login

- [ ] Valid credentials work.
- [ ] Invalid credentials show safe error.
- [ ] Locked/suspended user cannot log in.
- [ ] Logout works.
- [ ] Session survives refresh appropriately.
- [ ] Expired session redirects correctly.

### Admin MFA

- [ ] MFA enrollment works.
- [ ] Correct code succeeds.
- [ ] Invalid code fails.
- [ ] Admin cannot bypass MFA.

## 4. Authorization Tests

For every role:
- [ ] Learner cannot access instructor routes.
- [ ] Learner cannot access admin routes.
- [ ] Instructor cannot access admin routes.
- [ ] Instructor can only manage permitted courses.
- [ ] Org Admin cannot access another organization.
- [ ] Content reviewer has only review permissions.
- [ ] Support agent cannot perform privileged admin actions.

Test both UI and direct HTTP/server calls.

## 5. Learner E2E

### Core journey

```text
Signup
→ Login
→ Dashboard
→ Search course
→ Course details
→ Enroll
→ My Learning
→ Start course
→ Complete lesson
→ Assessment
→ Pass
→ Complete course
→ Certificate
```

Assertions:
- enrollment persists after refresh,
- lesson progress persists,
- assessment result persists,
- certificate appears when eligible.

## 6. Course Player Tests

- [ ] Correct lesson loads.
- [ ] Curriculum navigation works.
- [ ] Previous/next works.
- [ ] Video progress persists where supported.
- [ ] Lesson completion updates.
- [ ] Locked lesson cannot be opened.
- [ ] Course version is correct.
- [ ] Unauthorized learner cannot access private course content.

## 7. Assessment Tests

- [ ] Assessment starts.
- [ ] Questions load.
- [ ] Answers save.
- [ ] Attempt state persists.
- [ ] Submission works.
- [ ] Correct grading occurs.
- [ ] Pass/fail threshold works.
- [ ] Retry rules work.
- [ ] Answer key is not leaked to learner API.

## 8. Assignment Tests

- [ ] Assignment loads.
- [ ] Submission uploads.
- [ ] Invalid file is rejected.
- [ ] Submission status updates.
- [ ] Instructor can review.
- [ ] Learner cannot edit after locked submission where policy requires.

## 9. Certificate Tests

- [ ] Eligible learner receives certificate.
- [ ] Ineligible learner cannot generate certificate.
- [ ] Certificate ID is unique.
- [ ] Verification page works.
- [ ] Revoked certificate displays revoked status.
- [ ] Private learner data is not exposed.
- [ ] Instructor issued-list is scoped to their own courses only (T-110).
- [ ] Instructor can save a certificate template (signature title, closing message) for a course they own (T-110).
- [ ] An instructor cannot edit the certificate template of a course they do not own (T-110).
- [ ] Saving a template never rewrites certificates already issued; only future issuances snapshot it (T-110).

## 10. Instructor E2E

```text
Login
→ Dashboard
→ Create Course
→ Course Basics
→ Curriculum
→ Add Lesson
→ Add Content
→ Add Assessment
→ Preview
→ Readiness
→ Submit
```

Test:
- [ ] Course saves.
- [ ] Curriculum persists.
- [ ] Lesson content persists.
- [ ] Assessment persists.
- [ ] Readiness detects missing requirements.
- [ ] Submission creates review state.

## 11. Instructor Review Feedback

- [ ] Instructor can see review status.
- [ ] Reviewer feedback is visible.
- [ ] Requested changes are linked to relevant course sections.
- [ ] Instructor can resubmit.
- [ ] Previous versions remain auditable.

## 12. Instructor Analytics

- [ ] Metrics load.
- [ ] Date filters work.
- [ ] Course filter works.
- [ ] Empty analytics state works.
- [ ] Unauthorized course data is not returned.
- [ ] Export respects permission scope.

## 13. Admin E2E

### User management

- [ ] Search works.
- [ ] Filters work.
- [ ] Add user works.
- [ ] Invite works.
- [ ] Suspend works.
- [ ] Role change works.
- [ ] Audit record is created.

### Course review

```text
Pending Course
→ Open Review
→ Inspect Course
→ Approve / Request Changes / Reject
→ Verify Status
→ Verify Audit Event
```

### Organization

- [ ] Create organization.
- [ ] Add member.
- [ ] Assign role.
- [ ] Organization data is isolated.

## 14. Commerce Tests

- [ ] Order created.
- [ ] Payment success updates order.
- [ ] Payment failure updates order.
- [ ] Duplicate webhook is idempotent.
- [ ] Refund updates payment state.
- [ ] Enrollment is not granted by an unverified client signal.

## 15. AI Tutor Tests

- [ ] AI conversation starts.
- [ ] Current course context is passed correctly.
- [ ] Retrieval only returns authorized content.
- [ ] Unsupported question is handled safely.
- [ ] Assessment policy is respected.
- [ ] AI usage is recorded.
- [ ] AI failure produces recoverable UI.
- [ ] Timeout produces safe fallback.

## 16. AI Instructor Tests

- [ ] Outline generation works.
- [ ] Quiz generation works.
- [ ] Generated content can be edited.
- [ ] Generated content does not publish automatically.
- [ ] Failed generation can be retried.
- [ ] Usage is recorded.

## 17. RAG Tests

- [ ] Document uploads.
- [ ] Processing status changes.
- [ ] Failed document is visible.
- [ ] Chunks are associated with correct source.
- [ ] Unauthorized organization cannot retrieve chunks.
- [ ] Deleted source is removed from retrieval.
- [ ] Re-indexing works.

## 18. Responsive Tests

### 375px

- [ ] Learner navigation works.
- [ ] Bottom navigation does not cover content.
- [ ] Course player usable.
- [ ] Forms do not overflow.
- [ ] Tables become cards.
- [ ] Charts remain readable.

### 768px

- [ ] Sidebars collapse appropriately.
- [ ] Dashboard grids reflow.
- [ ] Modals fit viewport.

### 1440px

- [ ] Content does not become excessively wide.
- [ ] Tables use available space.
- [ ] Analytics are readable.
- [ ] Navigation remains stable.

## 19. Accessibility Tests

- [ ] Keyboard-only navigation.
- [ ] Visible focus.
- [ ] Form labels.
- [ ] Dialog focus trap.
- [ ] Escape closes overlays.
- [ ] Screen-reader labels.
- [ ] Status messages announced.
- [ ] Color is not the only status indicator.
- [ ] Reduced motion respected.

## 20. Performance Tests

Monitor:
- initial page load,
- route transition,
- largest contentful paint,
- image sizes,
- JS bundle size,
- database query time,
- dashboard query count,
- AI response latency.

Avoid loading heavy chart/editor libraries on pages that do not need them.

## 21. Error / Empty / Loading Tests

Every major screen must have:

### Loading
- skeleton,
- spinner for short actions,
- progress for long actions.

### Empty
- explanation,
- next action.

### Error
- readable message,
- retry/recovery.

### Permission denied
- no sensitive details,
- clear next step.

## 22. Regression

After every significant feature:

```text
Typecheck
→ Lint
→ Unit tests
→ Integration tests
→ E2E affected flow
→ Build
```

## 23. Production QA

The supplied guide explicitly recommends testing the live deployment, not only localhost, including direct URLs, logged-out access, invalid inputs, slow network, empty database and wrong credentials.

Production QA checklist:

```text
[ ] Signup
[ ] Login
[ ] Logout
[ ] Learner flow
[ ] Instructor flow
[ ] Admin flow
[ ] Database writes
[ ] Refresh behavior
[ ] Direct URLs
[ ] Permission boundaries
[ ] Invalid inputs
[ ] Empty states
[ ] Mobile
[ ] Tablet
[ ] Desktop
[ ] Slow network
[ ] Error recovery
[ ] Payment flow
[ ] Certificate verification
[ ] AI flow
```

## 24. Acceptance Rule

A feature is not complete until:

1. Acceptance criteria pass.
2. Relevant tests pass.
3. Authorization is verified.
4. Loading/empty/error states exist.
5. Responsive behavior is checked.
6. Documentation is updated.
7. The change is committed.

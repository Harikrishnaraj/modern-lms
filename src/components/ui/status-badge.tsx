import { Badge, type BadgeTone } from "./badge";
import type { CourseStatus } from "@/features/courses/course-status";

/** Status vocabulary from DESIGN.md §13. */
export type EnrollmentStatus = "active" | "completed" | "paused" | "expired" | "cancelled";
export type UserStatus = "invited" | "active" | "inactive" | "suspended";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "disputed";
export type AttemptStatus = "in_progress" | "submitted" | "graded";

type StatusMap<S extends string> = Record<S, { label: string; tone: BadgeTone }>;

const course: StatusMap<CourseStatus> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  in_review: { label: "In Review", tone: "info" },
  changes_requested: { label: "Changes Requested", tone: "warning" },
  approved: { label: "Approved", tone: "primary" },
  published: { label: "Published", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
};

const enrollment: StatusMap<EnrollmentStatus> = {
  active: { label: "Active", tone: "primary" },
  completed: { label: "Completed", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const user: StatusMap<UserStatus> = {
  invited: { label: "Invited", tone: "info" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  suspended: { label: "Suspended", tone: "danger" },
};

const payment: StatusMap<PaymentStatus> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  disputed: { label: "Disputed", tone: "danger" },
};

const attempt: StatusMap<AttemptStatus> = {
  in_progress: { label: "In Progress", tone: "warning" },
  submitted: { label: "Submitted", tone: "info" },
  graded: { label: "Graded", tone: "success" },
};

type Props =
  | { kind: "course"; status: CourseStatus }
  | { kind: "enrollment"; status: EnrollmentStatus }
  | { kind: "user"; status: UserStatus }
  | { kind: "payment"; status: PaymentStatus }
  | { kind: "attempt"; status: AttemptStatus };

export function StatusBadge(props: Props) {
  const entry =
    props.kind === "course"
      ? course[props.status]
      : props.kind === "enrollment"
        ? enrollment[props.status]
        : props.kind === "user"
          ? user[props.status]
          : props.kind === "payment"
          ? payment[props.status]
          : attempt[props.status];
  return (
    <Badge tone={entry.tone} dot>
      {entry.label}
    </Badge>
  );
}

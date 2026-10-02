import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

interface StateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** Error reference shown to the user (the Next.js error digest); it is logged with the request ID (T-242). */
  reference?: string;
}

function StateFrame({
  title,
  description,
  action,
  icon: Icon,
  tone,
  role,
  className,
  reference,
}: StateProps & { icon: LucideIcon; tone: string; role?: "alert" | "status" }) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div className={cn("mb-4 flex size-12 items-center justify-center rounded-full", tone)}>
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {description && <p className="mt-1.5 max-w-md text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
      {reference && (
        <p className="mt-4 text-xs text-text-secondary">
          Reference: <span className="font-mono select-all">{reference}</span>
        </p>
      )}
    </div>
  );
}

/** Empty: what is empty, why, what to do next (DESIGN.md §19). */
export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return <StateFrame icon={icon} tone="bg-primary-light text-primary" {...props} />;
}

/** Error: explain, offer recovery, no technical detail (DESIGN.md §20). */
export function ErrorState({ icon = AlertTriangle, ...props }: StateProps) {
  return <StateFrame icon={icon} tone="bg-danger-light text-danger" role="alert" {...props} />;
}

/** Permission denied: no sensitive details, clear next step (TEST_PLAN §21). */
export function PermissionDeniedState({ icon = Lock, ...props }: StateProps) {
  return <StateFrame icon={icon} tone="bg-warning-light text-warning-text" {...props} />;
}

/** Generic page-level loading skeleton for dashboards/lists. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

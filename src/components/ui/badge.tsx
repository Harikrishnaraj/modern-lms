import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "ai";

const tones: Record<BadgeTone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-border-subtle text-neutral-text", dot: "bg-text-muted" },
  primary: { pill: "bg-primary-light text-primary-dark", dot: "bg-primary" },
  success: { pill: "bg-success-light text-success-text", dot: "bg-success" },
  warning: { pill: "bg-warning-light text-warning-text", dot: "bg-warning" },
  danger: { pill: "bg-danger-light text-danger-text", dot: "bg-danger" },
  info: { pill: "bg-info-light text-info-text", dot: "bg-info" },
  ai: { pill: "bg-ai-light text-ai", dot: "bg-ai" },
};

interface BadgeProps {
  tone?: BadgeTone;
  /** Show a leading status dot. The text label is always present, so color is never the only signal. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", dot = false, children, className }: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        t.pill,
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./class-names";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "verified" | "ai-assist";

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly variant?: BadgeVariant;
  readonly context?: string;
  readonly showIndicator?: boolean;
  readonly children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-border bg-surface-subtle text-foreground",
  primary: "border-primary/20 bg-primary-subtle text-primary-hover",
  success: "border-success/20 bg-success-subtle text-success-foreground",
  warning: "border-warning/25 bg-warning-subtle text-warning-foreground",
  danger: "border-danger/20 bg-danger-subtle text-danger",
  info: "border-info/20 bg-info-subtle text-info-foreground",
  verified: "border-primary/25 bg-primary-subtle text-primary-hover",
  "ai-assist": "border-info/20 bg-sky text-info-foreground"
};

const indicatorClasses: Record<BadgeVariant, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  verified: "bg-primary",
  "ai-assist": "bg-info"
};

export function Badge({
  variant = "neutral",
  context,
  showIndicator = false,
  className,
  children,
  ...badgeProps
}: BadgeProps) {
  return (
    <span
      {...badgeProps}
      className={cx(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-ui-xs font-semibold",
        variantClasses[variant],
        className
      )}
    >
      {showIndicator ? (
        <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", indicatorClasses[variant])} aria-hidden="true" />
      ) : null}
      {context ? <span className="sr-only">{context}: </span> : null}
      {children}
    </span>
  );
}

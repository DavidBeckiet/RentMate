import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./class-names";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly variant?: BadgeVariant;
  readonly context?: string;
  readonly showIndicator?: boolean;
  readonly children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-heroDark-950 bg-rent-surface text-heroDark-950",
  primary: "border-heroDark-950 bg-rent-accent-subtle text-heroDark-950",
  success: "border-heroDark-950 bg-rent-accent-subtle text-heroDark-950",
  warning: "border-heroDark-950 bg-rent-yellow text-heroDark-950",
  danger: "border-heroDark-950 bg-rent-coral text-heroDark-950",
  info: "border-heroDark-950 bg-rent-surface text-heroDark-950"
};

const indicatorClasses: Record<BadgeVariant, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info"
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
        "inline-flex min-h-7 max-w-full items-center gap-1.5 border-2 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.08em]",
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

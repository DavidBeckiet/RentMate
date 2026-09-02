import { cx } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-primary bg-primary text-primary-foreground shadow-surface hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-raised",
  secondary:
    "border border-border-strong bg-surface text-foreground shadow-surface hover:-translate-y-0.5 hover:border-primary hover:bg-primary-subtle hover:shadow-raised",
  outline:
    "border border-primary/40 bg-transparent text-primary-hover hover:-translate-y-0.5 hover:border-primary hover:bg-primary-subtle hover:shadow-surface",
  ghost: "border border-transparent bg-transparent text-foreground hover:bg-surface-subtle hover:text-primary-hover",
  danger:
    "border border-danger bg-danger text-danger-foreground shadow-surface hover:-translate-y-0.5 hover:bg-danger-hover hover:shadow-raised",
  soft: "border border-primary/10 bg-primary-subtle text-primary-hover hover:-translate-y-0.5 hover:bg-primary-100 hover:shadow-surface"
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 text-ui-sm",
  md: "min-h-12 px-4 text-ui-sm",
  lg: "min-h-[3.25rem] px-5 text-ui-base"
};

const iconButtonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-11 w-11",
  md: "h-11 w-11",
  lg: "h-12 w-12"
};

const sharedClasses =
  "rounded-control font-sans font-semibold tracking-[-0.01em] outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-standard ease-standard active:translate-y-px disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-muted-foreground disabled:shadow-none motion-reduce:transition-none";

export function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cx(
    "inline-flex max-w-full items-center justify-center gap-2",
    sharedClasses,
    buttonSizeClasses[size],
    variantClasses[variant],
    className
  );
}

export function iconButtonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cx(
    "inline-grid shrink-0 place-items-center",
    sharedClasses,
    iconButtonSizeClasses[size],
    variantClasses[variant],
    className
  );
}

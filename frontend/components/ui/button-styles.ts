import { cx } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
  secondary: "border-primary/15 bg-primary-subtle text-primary-hover hover:border-primary/30 hover:bg-primary/15",
  outline: "border-border-strong bg-surface text-foreground hover:border-primary/50 hover:bg-surface-subtle",
  ghost: "border-transparent bg-transparent text-foreground shadow-none hover:bg-muted",
  danger: "border-danger bg-danger text-danger-foreground hover:border-danger-hover hover:bg-danger-hover"
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-2 text-ui-sm",
  md: "min-h-11 px-4 py-2.5 text-ui-sm",
  lg: "min-h-12 px-5 py-3 text-ui-base"
};

const iconButtonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-11 w-11",
  md: "h-11 w-11",
  lg: "h-12 w-12"
};

const sharedClasses =
  "rounded-control border shadow-surface transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-muted-foreground disabled:shadow-none";

export function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cx(
    "inline-flex max-w-full items-center justify-center gap-2 font-sans font-semibold",
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

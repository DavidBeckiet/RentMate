import { cx } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-2 border-heroDark-950 bg-rent-accent text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass",
  secondary:
    "border-2 border-heroDark-950 bg-rent-surface text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-[#e5eefc] hover:shadow-glass",
  outline:
    "border-2 border-heroDark-950 bg-rent-surface text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-rent-accent hover:shadow-glass",
  ghost:
    "border-2 border-transparent bg-transparent text-heroDark-950 shadow-none hover:border-heroDark-950 hover:bg-rent-accent",
  danger:
    "border-2 border-heroDark-950 bg-rent-coral text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass"
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
  "font-display font-bold tracking-tight transition-[background-color,border-color,color,box-shadow,transform] duration-200 disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-heroDark-950/40 disabled:bg-[#dfddd5] disabled:text-rent-subtle disabled:shadow-none";

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

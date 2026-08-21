import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly pending?: boolean;
  readonly pendingLabel?: string;
  readonly children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-2 border-heroDark-950 bg-rent-accent text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass active:translate-x-0 active:translate-y-0 active:shadow-none",
  secondary:
    "border-2 border-heroDark-950 bg-rent-surface text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-[#e5eefc] hover:shadow-glass active:translate-x-0 active:translate-y-0 active:shadow-none",
  danger:
    "border-2 border-heroDark-950 bg-rent-coral text-heroDark-950 shadow-glass-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass active:translate-x-0 active:translate-y-0 active:shadow-none"
};

export function Button({
  type = "button",
  variant = "primary",
  pending = false,
  pendingLabel = "Đang xử lý…",
  disabled,
  className = "",
  children,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 font-display text-sm font-bold tracking-tight transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-heroDark-950/40 disabled:bg-[#dfddd5] disabled:text-rent-subtle disabled:shadow-none ${variantClasses[variant]} ${className}`}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin border-2 border-current border-r-transparent motion-reduce:animate-none"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

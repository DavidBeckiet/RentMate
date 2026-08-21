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
    "border border-sky-600/90 bg-gradient-to-r from-sky-600 via-sky-700 to-blue-800 text-white shadow-lg shadow-sky-900/20 hover:-translate-y-0.5 hover:shadow-xl hover:brightness-110 active:translate-y-0 active:scale-[0.98]",
  secondary:
    "border border-slate-200 bg-white/90 text-slate-800 shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-sky-500 hover:bg-sky-50/70 hover:text-sky-900 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
  danger:
    "border border-rose-600/90 bg-gradient-to-r from-rose-600 via-rose-700 to-rose-800 text-white shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:brightness-110 active:translate-y-0 active:scale-[0.98]"
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:scale-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none ${variantClasses[variant]} ${className}`}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

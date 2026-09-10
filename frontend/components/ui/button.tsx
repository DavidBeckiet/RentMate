import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button-styles";

export type { ButtonSize, ButtonVariant } from "./button-styles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly pending?: boolean;
  readonly pendingLabel?: string;
  readonly children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    type = "button",
    variant = "primary",
    size = "md",
    pending = false,
    pendingLabel = "Đang xử lý…",
    disabled,
    className = "",
    children,
    ...buttonProps
  },
  ref
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-loading={pending || undefined}
      className={buttonClassName(variant, size, className)}
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
});

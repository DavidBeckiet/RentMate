import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonSize, ButtonVariant } from "./button";
import { iconButtonClassName } from "./button-styles";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  readonly label: string;
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly pending?: boolean;
  readonly pendingLabel?: string;
}

export function IconButton({
  type = "button",
  label,
  variant = "ghost",
  size = "md",
  pending = false,
  pendingLabel = "Đang xử lý…",
  disabled,
  className,
  children,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      aria-label={pending ? pendingLabel : label}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      data-loading={pending || undefined}
      className={iconButtonClassName(variant, size, className)}
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      ) : (
        children
      )}
    </button>
  );
}

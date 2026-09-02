import { useId, type ReactNode } from "react";
import { cx } from "./class-names";
import { Icon, type IconName } from "./icon";
import { IconButton } from "./icon-button";

export type ToastVariant = "info" | "success" | "warning" | "danger" | "ai-assist";

export interface ToastProps {
  readonly variant?: ToastVariant;
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
  readonly className?: string;
}

const variantClasses: Record<ToastVariant, string> = {
  info: "border-info/25 bg-surface text-info-foreground",
  success: "border-success/25 bg-surface text-success-foreground",
  warning: "border-warning/25 bg-surface text-warning-foreground",
  danger: "border-danger/25 bg-surface text-danger",
  "ai-assist": "border-info/25 bg-surface text-info-foreground"
};

const iconNames: Record<ToastVariant, IconName> = {
  info: "note",
  success: "check",
  warning: "flag",
  danger: "flag",
  "ai-assist": "sparkles"
};

export function Toast({
  variant = "info",
  title,
  description,
  action,
  onDismiss,
  dismissLabel = "Đóng thông báo",
  className
}: ToastProps) {
  const urgent = variant === "warning" || variant === "danger";
  const titleId = useId();

  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-labelledby={titleId}
      className={cx(
        "flex w-full max-w-md gap-3 rounded-card border p-4 shadow-raised",
        variantClasses[variant],
        className
      )}
    >
      <Icon name={iconNames[variant]} className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p id={titleId} className="font-sans text-ui-sm font-bold">
          {title}
        </p>
        {description ? <div className="mt-1 text-ui-sm leading-6 opacity-90">{description}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton
          label={dismissLabel}
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="-mr-1 -mt-1"
          type="button"
        >
          <Icon name="close" className="h-4 w-4" />
        </IconButton>
      ) : null}
    </div>
  );
}

export function ToastViewport({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-toast flex justify-end sm:inset-x-auto sm:right-6 sm:w-[min(100%-3rem,28rem)]">
      <div className="pointer-events-auto flex w-full flex-col gap-3">{children}</div>
    </div>
  );
}

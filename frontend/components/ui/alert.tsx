import { useId, type ReactNode } from "react";
import { cx } from "./class-names";
import { Icon, type IconName } from "./icon";

export type AlertVariant = "info" | "success" | "warning" | "danger" | "ai-assist";

export interface AlertProps {
  readonly variant?: AlertVariant;
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  info: "border-info/25 bg-info-subtle text-info-foreground",
  success: "border-success/25 bg-success-subtle text-success-foreground",
  warning: "border-warning/25 bg-warning-subtle text-warning-foreground",
  danger: "border-danger/25 bg-danger-subtle text-danger",
  "ai-assist": "border-info/25 bg-sky text-info-foreground"
};

const iconNames: Record<AlertVariant, IconName> = {
  info: "note",
  success: "check",
  warning: "flag",
  danger: "flag",
  "ai-assist": "sparkles"
};

export function Alert({ variant = "info", title, description, action, className }: AlertProps) {
  const urgent = variant === "warning" || variant === "danger";
  const titleId = useId();

  return (
    <section
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-labelledby={titleId}
      className={cx("flex gap-3 rounded-card border p-4 shadow-surface", variantClasses[variant], className)}
    >
      <Icon name={iconNames[variant]} className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="font-sans text-ui-sm font-bold">
          {title}
        </h2>
        {description ? <div className="mt-1 text-ui-sm leading-6 opacity-90">{description}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </section>
  );
}

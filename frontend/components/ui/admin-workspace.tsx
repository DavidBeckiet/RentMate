import type { ReactNode } from "react";
import { Badge, type BadgeVariant } from "./badge";
import { cx } from "./class-names";
import { Icon, type IconName } from "./icon";

export type AdminTone = "default" | "attention" | "info" | "success" | "muted";

const toneToBadge: Record<AdminTone, BadgeVariant> = {
  default: "primary",
  attention: "warning",
  info: "info",
  success: "success",
  muted: "neutral"
};

export function AdminPage({
  children,
  labelledBy,
  className
}: Readonly<{ children: ReactNode; labelledBy?: string; className?: string }>) {
  return (
    <section aria-labelledby={labelledBy} className={cx("rm-admin-page rm-workspace space-y-6", className)}>
      {children}
    </section>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  icon = "shield",
  tone = "default",
  actions,
  titleId
}: Readonly<{
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  tone?: AdminTone;
  actions?: ReactNode;
  titleId?: string;
}>) {
  return (
    <header className={cx("rm-admin-hero", tone !== "default" && `rm-admin-hero--${tone}`)}>
      <div className="min-w-0">
        <span className="rm-admin-eyebrow">
          <Icon name={icon} className="h-4 w-4" />
          {eyebrow}
        </span>
        <h1 className="rm-admin-title" id={titleId}>
          {title}
        </h1>
        {description ? <p className="rm-admin-description">{description}</p> : null}
      </div>
      {actions ? <div className="rm-admin-header-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminToolbar({
  children,
  summary,
  className
}: Readonly<{ children: ReactNode; summary?: ReactNode; className?: string }>) {
  return (
    <div className={cx("rm-admin-toolbar", className)}>
      <div className="rm-admin-toolbar-controls">{children}</div>
      {summary ? <div className="rm-admin-toolbar-summary">{summary}</div> : null}
    </div>
  );
}

export function AdminFilter({
  id,
  label,
  children,
  className
}: Readonly<{ id: string; label: string; children: ReactNode; className?: string }>) {
  return (
    <label htmlFor={id} className={cx("rm-admin-filter", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function AdminSummaryGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="rm-admin-summary-grid">{children}</div>;
}

export function AdminSummaryCard({
  label,
  value,
  note,
  tone = "default",
  icon
}: Readonly<{
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: AdminTone;
  icon?: IconName;
}>) {
  return (
    <div className={cx("rm-admin-summary-card", `rm-admin-summary-card--${tone}`)}>
      <div className="flex items-start justify-between gap-3">
        <p className="rm-admin-summary-label">{label}</p>
        {icon ? (
          <span className="rm-admin-summary-icon" aria-hidden="true">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="rm-admin-summary-value">{value}</p>
      {note ? <p className="rm-admin-summary-note">{note}</p> : null}
    </div>
  );
}

export function AdminStatus({
  children,
  tone = "default",
  context
}: Readonly<{ children: ReactNode; tone?: AdminTone; context?: string }>) {
  return (
    <Badge variant={toneToBadge[tone]} context={context} showIndicator>
      {children}
    </Badge>
  );
}

export function AdminSection({
  title,
  description,
  action,
  children,
  className
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={cx("rm-admin-section", className)}>
      <div className="rm-admin-section-header">
        <div className="min-w-0">
          <h2 className="rm-admin-section-title">{title}</h2>
          {description ? <p className="rm-admin-section-description">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminQueueLayout({
  queue,
  detail,
  className
}: Readonly<{ queue: ReactNode; detail: ReactNode; className?: string }>) {
  return (
    <div className={cx("rm-admin-queue-layout", className)}>
      <div className="rm-admin-queue" aria-label="Danh sách cần xử lý">
        {queue}
      </div>
      <aside className="rm-admin-detail" aria-label="Chi tiết xử lý">
        {detail}
      </aside>
    </div>
  );
}

export function AdminQueueCard({
  children,
  selected = false,
  className
}: Readonly<{ children: ReactNode; selected?: boolean; className?: string }>) {
  return (
    <article className={cx("rm-admin-queue-card", selected && "rm-admin-queue-card--selected", className)}>
      {children}
    </article>
  );
}

export function AdminEvidence({
  title,
  children,
  tone = "muted",
  icon = "note",
  className
}: Readonly<{
  title: ReactNode;
  children: ReactNode;
  tone?: AdminTone;
  icon?: IconName;
  className?: string;
}>) {
  return (
    <section className={cx("rm-admin-evidence", `rm-admin-evidence--${tone}`, className)}>
      <h3 className="rm-admin-evidence-title">
        <Icon name={icon} className="h-4 w-4" />
        {title}
      </h3>
      <div className="rm-admin-evidence-body">{children}</div>
    </section>
  );
}

export function AdminDecisionPanel({
  title = "Quyết định xử lý",
  description,
  children,
  className
}: Readonly<{ title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }>) {
  return (
    <section className={cx("rm-admin-decision-panel", className)}>
      <div>
        <h3 className="rm-admin-decision-title">{title}</h3>
        {description ? <p className="rm-admin-decision-description">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AdminTimeline({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="rm-admin-timeline">{children}</div>;
}

export function AdminPill({ children, tone = "muted" }: Readonly<{ children: ReactNode; tone?: AdminTone }>) {
  return <span className={cx("rm-admin-pill", `rm-admin-pill--${tone}`)}>{children}</span>;
}

import type { ReactNode } from "react";
import { Button } from "./button";
import { cx } from "./class-names";

export interface LoadingStateProps {
  readonly message?: string;
  readonly className?: string;
}

export function LoadingState({ message = "Đang tải…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "flex min-h-40 flex-col items-center justify-center gap-4 rounded-card border border-border bg-surface p-6 text-center shadow-surface",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary motion-reduce:animate-none"
      />
      <span className="text-ui-sm font-semibold text-muted-foreground">{message}</span>
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly visual?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ title, description, visual, action, className }: EmptyStateProps) {
  return (
    <section
      className={cx(
        "flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface p-6 text-center shadow-surface sm:p-8",
        className
      )}
    >
      {visual ? <div className="mb-4 text-muted-foreground">{visual}</div> : null}
      <h2 className="font-display text-heading-sm font-bold text-foreground">{title}</h2>
      {description ? <p className="mt-2 max-w-prose text-ui-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

export interface ErrorStateProps {
  readonly message: string;
  readonly title?: string;
  readonly requestId?: string | null;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly action?: ReactNode;
  readonly tone?: "danger" | "neutral";
  readonly className?: string;
}

export function ErrorState({
  message,
  title = "Không thể hoàn tất yêu cầu",
  onRetry,
  retryLabel = "Thử lại",
  action,
  tone = "danger",
  className
}: ErrorStateProps) {
  return (
    <section
      role="alert"
      className={cx(
        "rounded-card p-5 text-left text-foreground shadow-surface",
        tone === "neutral" ? "border border-border bg-surface" : "border border-danger/30 bg-danger-subtle",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "mb-3 grid h-9 w-9 place-items-center rounded-full font-display text-heading-sm font-bold text-foreground",
          tone === "neutral" ? "border border-border bg-surface-subtle" : "border border-danger/30 bg-coral"
        )}
      >
        !
      </span>
      <h2 className="font-display text-ui-base font-semibold">{title}</h2>
      <p className="mt-1 text-ui-sm text-muted-foreground">{message}</p>
      {onRetry || action ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </section>
  );
}

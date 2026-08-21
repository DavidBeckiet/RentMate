import type { ReactNode } from "react";

export interface LoadingStateProps {
  readonly message?: string;
}

export function LoadingState({ message = "Đang tải…" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rm-feedback-state min-h-36"
    >
      <span aria-hidden="true" className="rm-loading-mark motion-reduce:animate-none"><span /></span>
      <span className="font-medium text-rent-secondary">{message}</span>
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="rm-feedback-state border-dashed p-7 text-center sm:p-10">
      <span aria-hidden="true" className="rm-feedback-icon">+</span>
      <h2 className="text-lg font-semibold text-rent-ink">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-rent-secondary">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

export interface ErrorStateProps {
  readonly message: string;
  readonly requestId?: string | null;
  readonly action?: ReactNode;
}

export function ErrorState({ message, requestId, action }: ErrorStateProps) {
  return (
    <section role="alert" className="rm-feedback-state items-start border-red-200 bg-red-50 p-5 text-left text-red-950">
      <span aria-hidden="true" className="rm-feedback-icon border-red-200 bg-white text-red-700">!</span>
      <h2 className="font-semibold">Không thể hoàn tất yêu cầu</h2>
      <p className="mt-1 text-sm">{message}</p>
      {requestId ? <p className="mt-2 text-xs text-red-800">Mã yêu cầu: {requestId}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

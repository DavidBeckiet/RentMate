import type { ReactNode } from "react";

export interface LoadingStateProps {
  readonly message?: string;
}

export function LoadingState({ message = "Đang tải…" }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-32 items-center justify-center gap-3 text-slate-700">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-teal-700 border-r-transparent motion-reduce:animate-none"
      />
      <span>{message}</span>
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
    <section className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
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
    <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-950">
      <h2 className="font-semibold">Không thể hoàn tất yêu cầu</h2>
      <p className="mt-1 text-sm">{message}</p>
      {requestId ? <p className="mt-2 text-xs text-red-800">Mã yêu cầu: {requestId}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

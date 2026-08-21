import type { ReactNode } from "react";
import { Icon } from "./icon";

export interface LoadingStateProps {
  readonly message?: string;
}

export function LoadingState({ message = "Đang tải…" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-40 flex-col items-center justify-center gap-4 border-2 border-heroDark-950 bg-rent-surface p-7 shadow-glass-sm"
    >
      <span
        aria-hidden="true"
        className="relative grid h-12 w-12 animate-spin place-items-center border-2 border-heroDark-950 bg-rent-accent motion-reduce:animate-none"
      >
        <span className="h-3 w-3 bg-rent-coral" />
      </span>
      <span className="font-display text-sm font-bold text-rent-secondary">{message}</span>
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
    <section className="flex flex-col items-center border-2 border-dashed border-heroDark-950 bg-rent-surface p-7 text-center shadow-glass-sm sm:p-10">
      <span
        aria-hidden="true"
        className="mb-4 grid h-12 w-12 place-items-center border-2 border-heroDark-950 bg-rent-accent shadow-glass-sm"
      >
        <Icon name="plus" />
      </span>
      <h2 className="font-display text-xl font-bold text-rent-ink">{title}</h2>
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
    <section
      role="alert"
      className="border-2 border-heroDark-950 bg-rent-coral p-5 text-left text-heroDark-950 shadow-glass"
    >
      <span
        aria-hidden="true"
        className="mb-3 grid h-10 w-10 place-items-center border-2 border-heroDark-950 bg-white font-display text-xl font-bold"
      >
        !
      </span>
      <h2 className="font-display font-bold">Không thể hoàn tất yêu cầu</h2>
      <p className="mt-1 text-sm">{message}</p>
      {requestId ? <p className="mt-2 text-xs font-semibold">Mã yêu cầu: {requestId}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

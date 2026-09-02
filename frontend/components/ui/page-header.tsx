import type { ReactNode } from "react";
import { cx } from "./class-names";

export interface PageHeaderProps {
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cx(
        "flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
        <h1 className="font-display text-heading-lg font-bold leading-tight tracking-tight text-foreground sm:text-[2.75rem] sm:leading-[1.15]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-ui-base leading-7 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

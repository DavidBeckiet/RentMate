import type { ReactNode } from "react";
import { cx } from "./class-names";

export interface SectionHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-heading-md font-bold leading-tight tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-ui-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

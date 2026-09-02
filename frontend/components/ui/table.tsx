import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./class-names";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-card border border-border bg-surface shadow-surface">
      <table {...props} className={cx("min-w-full border-collapse text-left text-ui-sm", className)} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={cx("border-b border-border bg-surface-subtle", className)} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={cx("divide-y divide-border", className)} />;
}

export function TableFooter({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot {...props} className={cx("border-t border-border bg-surface-subtle", className)} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={cx("transition-colors duration-fast hover:bg-surface-subtle", className)} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      scope={props.scope ?? "col"}
      className={cx(
        "whitespace-nowrap px-4 py-3 font-sans text-ui-xs font-bold uppercase tracking-[0.06em] text-muted-foreground",
        className
      )}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cx("px-4 py-3 align-middle text-foreground", className)} />;
}

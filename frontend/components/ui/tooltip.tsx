"use client";

import { cloneElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { cx } from "./class-names";

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactElement<{ readonly "aria-describedby"?: string }>;
  readonly className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const describedBy =
    [children.props["aria-describedby"], open ? tooltipId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <span
      className={cx("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-dropdown w-max max-w-64 -translate-x-1/2 rounded-control bg-brand-dark px-2.5 py-1.5 text-center text-ui-xs font-semibold text-white shadow-raised"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

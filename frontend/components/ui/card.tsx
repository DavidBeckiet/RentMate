import type { HTMLAttributes } from "react";
import { cx } from "./class-names";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly padding?: CardPadding;
  readonly subtle?: boolean;
  readonly interactive?: boolean;
}

const paddingClasses: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-6 sm:p-8"
};

export function Card({ padding = "md", subtle = false, interactive = false, className, ...cardProps }: CardProps) {
  return (
    <div
      {...cardProps}
      className={cx(
        "overflow-hidden rounded-card border border-border bg-surface shadow-surface",
        subtle && "bg-surface-subtle",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-standard ease-standard hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised motion-reduce:transition-none",
        paddingClasses[padding],
        className
      )}
    />
  );
}

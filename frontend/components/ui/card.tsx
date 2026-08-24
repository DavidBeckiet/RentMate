import type { HTMLAttributes } from "react";
import { cx } from "./class-names";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly padding?: CardPadding;
  readonly subtle?: boolean;
}

const paddingClasses: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-6 sm:p-8"
};

export function Card({ padding = "md", subtle = false, className, ...cardProps }: CardProps) {
  return (
    <div
      {...cardProps}
      className={cx(
        "overflow-hidden border-2 border-heroDark-950 bg-rent-surface shadow-glass",
        subtle && "bg-surface-subtle",
        paddingClasses[padding],
        className
      )}
    />
  );
}

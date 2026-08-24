import type { HTMLAttributes } from "react";
import { cx } from "./class-names";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  readonly rounded?: "control" | "card" | "full";
}

const roundedClasses: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  control: "border-2 border-heroDark-950/10",
  card: "border-2 border-heroDark-950/10",
  full: "rounded-full"
};

export function Skeleton({ rounded = "control", className, ...skeletonProps }: SkeletonProps) {
  return (
    <div
      {...skeletonProps}
      aria-hidden="true"
      className={cx("animate-pulse bg-rent-muted motion-reduce:animate-none", roundedClasses[rounded], className)}
    />
  );
}

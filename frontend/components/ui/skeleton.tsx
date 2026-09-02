import type { HTMLAttributes } from "react";
import { cx } from "./class-names";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  readonly rounded?: "control" | "card" | "full";
}

const roundedClasses: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  control: "rounded-control border border-border/60",
  card: "rounded-card border border-border/60",
  full: "rounded-full"
};

export function Skeleton({ rounded = "control", className, ...skeletonProps }: SkeletonProps) {
  return (
    <div
      {...skeletonProps}
      aria-hidden="true"
      className={cx("rm-skeleton bg-muted motion-reduce:animate-none", roundedClasses[rounded], className)}
    />
  );
}

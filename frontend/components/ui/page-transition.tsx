"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./class-names";

export function PageTransition({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={cx("rm-page-transition min-w-0", className)}>
      {children}
    </div>
  );
}

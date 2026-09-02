"use client";

import { Dialog, type DialogProps } from "./dialog";

export type DrawerProps = Omit<DialogProps, "mode">;

export function Drawer({ className, ...props }: DrawerProps) {
  return <Dialog {...props} mode="drawer" className={className} />;
}

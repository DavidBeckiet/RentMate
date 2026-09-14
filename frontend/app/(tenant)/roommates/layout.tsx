import type { ReactNode } from "react";
import { RoommateWorkspace } from "../../../features/roommate/roommate-workspace";

export default function RoommatesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RoommateWorkspace>{children}</RoommateWorkspace>;
}

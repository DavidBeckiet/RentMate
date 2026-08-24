import type { UserProfile } from "../../types/api";

export const accountRoleLabels = {
  TENANT: "Người thuê",
  LANDLORD: "Chủ nhà",
  ADMIN: "Quản trị viên"
} as const;

export function accountPrimaryIdentity(user: Pick<UserProfile, "displayName" | "email">): string {
  return user.displayName?.trim() || user.email;
}

export function accountInitials(user: Pick<UserProfile, "displayName" | "email">): string {
  const name = user.displayName?.trim();
  if (!name) return Array.from(user.email)[0]?.toLocaleUpperCase("vi") ?? "?";
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase("vi");
}

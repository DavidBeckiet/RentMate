import type { Metadata } from "next";
import { TenantProfile } from "../../../features/auth/tenant-profile";

export const metadata: Metadata = { title: "Hồ sơ | RentMate" };

export default function ProfilePage() {
  return <TenantProfile />;
}

import type { Metadata } from "next";
import { AdminVerificationsPage } from "../../../../features/auth/admin-verifications-page";

export const metadata: Metadata = {
  title: "Xác minh chủ trọ | RentMate",
  description: "Hàng đợi duyệt hồ sơ chủ trọ RentMate."
};

export default function VerificationsPage() {
  return <AdminVerificationsPage />;
}

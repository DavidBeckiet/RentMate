import { Suspense } from "react";
import { LoadingState } from "../../../components/ui/feedback-states";
import { AdminListingsPage } from "../../../features/listings/admin-listings-page";

export default function AdminDashboardRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hàng đợi kiểm duyệt…" />}>
      <AdminListingsPage />
    </Suspense>
  );
}

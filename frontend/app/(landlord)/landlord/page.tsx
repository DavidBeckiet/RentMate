import { Suspense } from "react";
import { LoadingState } from "../../../components/ui/feedback-states";
import { OwnerListingsPage } from "../../../features/listings/owner-listings-page";

export default function LandlordDashboardRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở trang quản lý tin…" />}>
      <OwnerListingsPage />
    </Suspense>
  );
}

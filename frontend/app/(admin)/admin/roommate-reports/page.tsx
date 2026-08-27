import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { AdminRoommateReportsPage } from "../../../../features/roommate/admin-roommate-reports-page";

export default function AdminRoommateReportsRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hàng đợi báo cáo ở ghép…" />}>
      <AdminRoommateReportsPage />
    </Suspense>
  );
}

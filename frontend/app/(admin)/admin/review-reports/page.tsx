import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { AdminReviewReportsPage } from "../../../../features/reports/admin-review-reports-page";

export default function AdminReviewReportsRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hàng đợi báo cáo đánh giá…" />}>
      <AdminReviewReportsPage />
    </Suspense>
  );
}

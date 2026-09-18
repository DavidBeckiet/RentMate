import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { AdminReviewsPage } from "../../../../features/reviews/admin-reviews-page";

export default function ReviewsPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hàng đợi đánh giá…" />}>
      <AdminReviewsPage />
    </Suspense>
  );
}

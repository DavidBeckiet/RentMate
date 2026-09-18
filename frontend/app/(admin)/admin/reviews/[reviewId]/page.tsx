import { Suspense } from "react";
import { LoadingState } from "../../../../../components/ui/feedback-states";
import { AdminReviewDetail } from "../../../../../features/reviews/admin-review-detail";

export default async function AdminReviewDetailRoute({ params }: { readonly params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return (
    <Suspense fallback={<LoadingState message="Đang mở đánh giá…" />}>
      <AdminReviewDetail reviewId={reviewId} />
    </Suspense>
  );
}

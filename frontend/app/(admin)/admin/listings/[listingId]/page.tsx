import { Suspense } from "react";
import { LoadingState } from "../../../../../components/ui/feedback-states";
import { AdminListingDetail } from "../../../../../features/listings/admin-listing-detail";

export default async function AdminListingRoute({ params }: { readonly params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return (
    <Suspense fallback={<LoadingState message="Đang mở chi tiết kiểm duyệt…" />}>
      <AdminListingDetail listingId={listingId} />
    </Suspense>
  );
}

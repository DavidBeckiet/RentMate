import { Suspense } from "react";
import { LoadingState } from "../../../../../components/ui/feedback-states";
import { AdminSupportRequestDetail } from "../../../../../features/help/admin-support-request-detail";

export default async function AdminSupportRequestDetailRoute({
  params
}: {
  readonly params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return (
    <Suspense fallback={<LoadingState message="Đang mở hồ sơ hỗ trợ…" />}>
      <AdminSupportRequestDetail requestId={requestId} />
    </Suspense>
  );
}

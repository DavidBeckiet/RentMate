import { Suspense } from "react";
import { LoadingState } from "../../../../../components/ui/feedback-states";
import { AdminVerificationDetail } from "../../../../../features/auth/admin-verification-detail";

export default async function AdminVerificationRoute({
  params
}: {
  readonly params: Promise<{ verificationId: string }>;
}) {
  const { verificationId } = await params;
  return (
    <Suspense fallback={<LoadingState message="Đang mở hồ sơ xác minh…" />}>
      <AdminVerificationDetail verificationId={verificationId} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { LoadingState } from "../../../../../components/ui/feedback-states";
import { AdminUserDetailPage } from "../../../../../features/auth/admin-user-detail";

export default async function AdminUserDetailRoute({ params }: { readonly params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <Suspense fallback={<LoadingState message="Đang mở không gian tài khoản…" />}>
      <AdminUserDetailPage userId={userId} />
    </Suspense>
  );
}

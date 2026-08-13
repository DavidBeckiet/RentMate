import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { AdminUsersPage } from "../../../../features/auth/admin-users-page";

export default function AdminUsersRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở quản lý người dùng…" />}>
      <AdminUsersPage />
    </Suspense>
  );
}

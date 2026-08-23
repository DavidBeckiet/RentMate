import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { AdminReportsPage } from "../../../../features/reports/admin-reports-page";

export default function AdminReportsRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hàng đợi báo cáo…" />}>
      <AdminReportsPage />
    </Suspense>
  );
}

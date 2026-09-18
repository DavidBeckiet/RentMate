import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { AdminContactReportsPage } from "../../../../features/reports/admin-contact-reports-page";

export default function AdminContactReportsRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hàng đợi báo cáo liên hệ…" />}>
      <AdminContactReportsPage />
    </Suspense>
  );
}

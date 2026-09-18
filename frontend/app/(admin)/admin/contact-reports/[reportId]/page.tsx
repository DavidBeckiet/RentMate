import { Suspense } from "react";
import { LoadingState } from "../../../../../components/ui/feedback-states";
import { AdminReportDetail } from "../../../../../features/reports/admin-report-detail";

export default async function AdminContactReportDetailRoute({
  params
}: {
  readonly params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return (
    <Suspense fallback={<LoadingState message="Đang mở báo cáo…" />}>
      <AdminReportDetail source="contact" reportId={reportId} />
    </Suspense>
  );
}

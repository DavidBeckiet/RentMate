"use client";

import { useCallback } from "react";
import { api } from "../../lib/api/client";
import type { AdminReviewReport } from "../../types/api";
import { AdminReportQueue, type QueueRow } from "./admin-report-queue";
import type { AdminReportQueueState } from "./admin-report-query";

const categories = [
  ["INACCURATE", "Không chính xác"],
  ["OFFENSIVE", "Xúc phạm"],
  ["HARASSMENT", "Quấy rối"],
  ["SPAM", "Spam"],
  ["OTHER", "Khác"]
] as const;
function row(report: AdminReviewReport): QueueRow {
  return {
    id: report.id,
    status: report.status,
    category: report.category,
    target: `Đánh giá #${report.reviewId}`,
    details: report.details,
    createdAt: report.createdAt,
    reporter: `Người dùng #${report.reporterId}`
  };
}
export function AdminReviewReportsPage() {
  const load = useCallback(async (state: AdminReportQueueState, signal: AbortSignal) => {
    const page = await api.admin.listReviewReports(
      {
        status: state.status as AdminReviewReport["status"],
        ...(state.category ? { category: state.category as AdminReviewReport["category"] } : {}),
        page: state.page,
        pageSize: 20
      },
      signal
    );
    return { data: page.data.map(row), pagination: page.pagination };
  }, []);
  return (
    <AdminReportQueue
      source="review"
      title="Báo cáo đánh giá"
      description="Kiểm tra các phản ánh về nội dung đánh giá đã công khai."
      categories={categories.map(([value, label]) => ({ value, label }))}
      load={load}
    />
  );
}

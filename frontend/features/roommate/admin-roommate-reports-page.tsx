"use client";

import { useCallback } from "react";
import { AdminReportQueue, type QueueRow } from "../reports/admin-report-queue";
import type { AdminReportQueueState } from "../reports/admin-report-query";
import { api } from "../../lib/api/client";
import type { AdminRoommateReport } from "../../types/api";
import { roommateReportCategoryLabels } from "./roommate-content";

function target(report: AdminRoommateReport): string {
  if (report.targetType === "ROOMMATE_PROFILE") return "Hồ sơ ở ghép";
  if (report.targetType === "ROOMMATE_MESSAGE") return `Tin nhắn #${report.subject.messageId ?? "—"}`;
  return `Yêu cầu ở ghép #${report.subject.requestId}`;
}
function row(report: AdminRoommateReport): QueueRow {
  return {
    id: report.id,
    status: report.status,
    category: report.category,
    target: target(report),
    details: report.details,
    createdAt: report.createdAt,
    reporter: report.reporter.displayName ?? "Thành viên RentMate",
    priority: report.riskSummary?.reviewPriority ?? null
  };
}
export function AdminRoommateReportsPage() {
  const load = useCallback(async (state: AdminReportQueueState, signal: AbortSignal) => {
    const page = await api.roommates.listAdminReports(
      {
        status: state.status as AdminRoommateReport["status"],
        ...(state.category ? { category: state.category as AdminRoommateReport["category"] } : {}),
        ...(state.reviewPriority ? { reviewPriority: state.reviewPriority } : {}),
        page: state.page,
        pageSize: 20
      },
      signal
    );
    return { data: page.data.map(row), pagination: page.pagination };
  }, []);
  return (
    <AdminReportQueue
      source="roommate"
      title="Báo cáo ở ghép"
      description="Hàng đợi giữ thứ tự ưu tiên do quy tắc an toàn cung cấp; quyết định vẫn thuộc về quản trị viên."
      categories={Object.entries(roommateReportCategoryLabels).map(([value, label]) => ({
        value: value as AdminRoommateReport["category"],
        label
      }))}
      load={load}
    />
  );
}

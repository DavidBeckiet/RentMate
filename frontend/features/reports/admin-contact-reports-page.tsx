"use client";

import { useCallback } from "react";
import { api } from "../../lib/api/client";
import type { AdminContactReport } from "../../types/api";
import { AdminReportQueue, type QueueRow } from "./admin-report-queue";
import type { AdminReportQueueState } from "./admin-report-query";

const categories = [
  ["SPAM", "Spam"],
  ["FRAUD", "Lừa đảo"],
  ["HARASSMENT", "Quấy rối"],
  ["INAPPROPRIATE", "Không phù hợp"],
  ["OTHER", "Khác"]
] as const;
function row(report: AdminContactReport): QueueRow {
  return {
    id: report.id,
    status: report.status,
    category: report.category,
    target: `Liên hệ về tin #${report.listingId}`,
    details: report.details ?? report.message?.body ?? null,
    createdAt: report.createdAt,
    reporter: report.reporter.email
  };
}
export function AdminContactReportsPage() {
  const load = useCallback(async (state: AdminReportQueueState, signal: AbortSignal) => {
    const page = await api.admin.listContactReports(
      {
        status: state.status as AdminContactReport["status"],
        ...(state.category ? { category: state.category as AdminContactReport["category"] } : {}),
        page: state.page,
        pageSize: 20
      },
      signal
    );
    return { data: page.data.map(row), pagination: page.pagination };
  }, []);
  return (
    <AdminReportQueue
      source="contact"
      title="Báo cáo liên hệ"
      description="Xem các phản ánh về liên hệ giữa người dùng trong RentMate."
      categories={categories.map(([value, label]) => ({ value, label }))}
      load={load}
    />
  );
}

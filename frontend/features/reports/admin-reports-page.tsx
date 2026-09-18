"use client";

import { useCallback } from "react";
import { api } from "../../lib/api/client";
import type { AdminListingReport } from "../../types/api";
import { AdminReportQueue, type QueueRow } from "./admin-report-queue";
import type { AdminReportQueueState } from "./admin-report-query";

const categories = [
  ["PRICE_INCORRECT", "Giá sai"],
  ["LOCATION_INCORRECT", "Vị trí sai"],
  ["IMAGE_INCORRECT", "Ảnh sai"],
  ["ALREADY_RENTED", "Đã cho thuê"],
  ["FRAUD", "Lừa đảo"],
  ["INAPPROPRIATE", "Không phù hợp"]
] as const;

function row(report: AdminListingReport): QueueRow {
  return {
    id: report.id,
    status: report.status,
    category: report.category,
    target: report.listing.title ?? `Tin đăng #${report.listing.id}`,
    details: report.details,
    createdAt: report.createdAt,
    reporter: report.reporter.email
  };
}

export function AdminReportsPage() {
  const load = useCallback(async (state: AdminReportQueueState, signal: AbortSignal) => {
    const page = await api.admin.listReports(
      {
        status: state.status as AdminListingReport["status"],
        ...(state.category ? { category: state.category as AdminListingReport["category"] } : {}),
        page: state.page,
        pageSize: 20
      },
      signal
    );
    return { data: page.data.map(row), pagination: page.pagination };
  }, []);
  return (
    <AdminReportQueue
      source="listing"
      title="Báo cáo tin đăng"
      description="Xem phản ánh về tin đăng và lưu lại từng quyết định xử lý."
      categories={categories.map(([value, label]) => ({ value, label }))}
      load={load}
    />
  );
}

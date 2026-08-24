import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingReport, ApiPage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listReports: vi.fn(), getReport: vi.fn(), updateReportStatus: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminReportsPage } from "./admin-reports-page";

const report: AdminListingReport = {
  id: 5,
  listing: { id: 42, title: "Phòng sáng", areaName: "Quận 3", status: "APPROVED" },
  reporter: { id: 7, email: "tenant@example.com", isActive: true },
  category: "FRAUD",
  details: "Đề nghị chuyển cọc.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: null,
  events: [
    {
      id: 1,
      actorId: 7,
      actorRole: "TENANT",
      previousStatus: null,
      newStatus: "OPEN",
      note: "Đề nghị chuyển cọc.",
      createdAt: "2026-08-23T00:00:00.000Z"
    }
  ]
};
const page: ApiPage<AdminListingReport> = { data: [report], pagination: { page: 1, pageSize: 20, hasNextPage: false } };

describe("AdminReportsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 1,
        displayName: null,
        role: "ADMIN",
        email: "admin@example.com",
        phone: null,
        isActive: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    apiMocks.listReports.mockResolvedValue(page);
    apiMocks.getReport.mockResolvedValue(report);
    apiMocks.updateReportStatus.mockResolvedValue({
      ...report,
      status: "INVESTIGATING",
      assignedAdminId: 1,
      events: [
        ...(report.events ?? []),
        {
          id: 2,
          actorId: 1,
          actorRole: "ADMIN",
          previousStatus: "OPEN",
          newStatus: "INVESTIGATING",
          note: null,
          createdAt: "2026-08-23T01:00:00.000Z"
        }
      ]
    });
  });

  it("loads the OPEN queue, displays history, and starts investigation", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByRole("heading", { name: "Phòng sáng" })).toBeInTheDocument();
    expect(apiMocks.listReports).toHaveBeenCalledWith(
      { status: "OPEN", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );
    fireEvent.click(screen.getByRole("button", { name: "Xem & xử lý" }));
    expect(await screen.findByRole("heading", { name: "Báo cáo #5" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu điều tra" }));
    await waitFor(() =>
      expect(apiMocks.updateReportStatus).toHaveBeenCalledWith(5, { status: "INVESTIGATING", note: null })
    );
  });

  it("blocks non-admin users before loading report data", () => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: { ...useAuthMock().user!, role: "TENANT" },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    render(<AdminReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listReports).not.toHaveBeenCalled();
  });

  it("shows a visible error when report detail cannot be loaded", async () => {
    apiMocks.getReport.mockRejectedValueOnce(new Error("unavailable"));
    render(<AdminReportsPage />);
    expect(await screen.findByRole("heading", { name: "Phòng sáng" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem & xử lý" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải chi tiết báo cáo");
  });
});

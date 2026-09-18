import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingReport } from "../../types/api";

const adminApi = vi.hoisted(() => ({ listReports: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: adminApi }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
import { AdminReportsPage } from "./admin-reports-page";

const admin = {
  id: 1,
  displayName: null,
  role: "ADMIN" as const,
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
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
  resolvedAt: null
};

describe("AdminReportsPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/reports");
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: admin,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    adminApi.listReports.mockResolvedValue({
      data: [report],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });
  it("loads the queue and links actionable reports to a dedicated detail route", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByRole("heading", { name: "Phòng sáng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem và xử lý" })).toHaveAttribute("href", "/admin/reports/5");
    await waitFor(() =>
      expect(adminApi.listReports).toHaveBeenCalledWith(
        { status: "OPEN", page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    );
  });
  it("does not load data for a non-admin", () => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: { ...admin, role: "TENANT" },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    render(<AdminReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(adminApi.listReports).not.toHaveBeenCalled();
  });
  it("offers previous-page recovery for an empty report page while preserving filters", async () => {
    window.history.replaceState(null, "", "/admin/reports?status=RESOLVED&category=FRAUD&page=3");
    adminApi.listReports.mockResolvedValueOnce({ data: [], pagination: { page: 3, pageSize: 20, hasNextPage: false } });

    render(<AdminReportsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Quay lại trang trước" }));
    expect(window.location.pathname + window.location.search).toBe(
      "/admin/reports?status=RESOLVED&category=FRAUD&page=2"
    );
  });
});

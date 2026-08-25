import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminContactReport, ApiPage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listContactReports: vi.fn(), getContactReport: vi.fn(), updateContactReportStatus: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminContactReportsPage } from "./admin-contact-reports-page";

const report: AdminContactReport = {
  id: 8,
  inquiryId: 12,
  listingId: 42,
  reporter: { id: 7, email: "tenant@example.com", isActive: true },
  message: { id: 2, senderRole: "LANDLORD", body: "Chuyển khoản trước để giữ phòng.", createdAt: "2026-08-23T00:00:00.000Z" },
  category: "FRAUD",
  details: "Yêu cầu đặt cọc ngoài hệ thống.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: null,
  events: [{ id: 1, actorId: 7, actorRole: "TENANT", previousStatus: null, newStatus: "OPEN", note: null, createdAt: "2026-08-23T00:00:00.000Z" }]
};
const page: ApiPage<AdminContactReport> = { data: [report], pagination: { page: 1, pageSize: 20, hasNextPage: false } };

describe("AdminContactReportsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: { id: 1, displayName: null, role: "ADMIN", email: "admin@example.com", phone: null, isActive: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    apiMocks.listContactReports.mockResolvedValue(page);
    apiMocks.getContactReport.mockResolvedValue(report);
    apiMocks.updateContactReportStatus.mockResolvedValue({ ...report, status: "INVESTIGATING", assignedAdminId: 1 });
  });

  it("loads the contact report queue and updates investigation status", async () => {
    render(<AdminContactReportsPage />);
    expect(await screen.findByRole("heading", { name: "Inquiry #12" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem & xử lý" }));
    expect(await screen.findByRole("heading", { name: "Báo cáo #8" })).toBeInTheDocument();
    expect(screen.getByText("Chuyển khoản trước để giữ phòng.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu điều tra" }));
    await waitFor(() => expect(apiMocks.updateContactReportStatus).toHaveBeenCalledWith(8, { status: "INVESTIGATING", note: null }));
  });

  it("does not load the queue for a non-admin", () => {
    useAuthMock.mockReturnValue({ ...useAuthMock(), user: { ...useAuthMock().user!, role: "TENANT" } });
    render(<AdminContactReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listContactReports).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminRoommateReport, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listAdminReports: vi.fn(),
  getAdminReport: vi.fn(),
  moderateProfile: vi.fn(),
  moderateRequest: vi.fn(),
  moderateMessage: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminRoommateReportsPage } from "./admin-roommate-reports-page";

const admin: UserProfile = {
  id: 1,
  role: "ADMIN",
  displayName: "Admin",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: admin, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("AdminRoommateReportsPage", () => {
  beforeEach(() => {
    apiMocks.listAdminReports.mockReset();
    apiMocks.getAdminReport.mockReset();
    apiMocks.moderateProfile.mockReset();
    apiMocks.moderateRequest.mockReset();
    apiMocks.moderateMessage.mockReset();
    apiMocks.listAdminReports.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    useAuthMock.mockReturnValue(auth());
  });

  it("loads the roommate-specific moderation queue through the typed API", async () => {
    render(<AdminRoommateReportsPage />);
    expect(await screen.findByRole("heading", { name: /Báo cáo ở ghép/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(apiMocks.listAdminReports).toHaveBeenCalledWith(
        { status: "OPEN", page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    );
    expect(screen.getByText("Không có báo cáo ở trạng thái này")).toBeInTheDocument();
  });

  it("uses the admin-only profile action context without rendering it", async () => {
    const report: AdminRoommateReport = {
      id: 17,
      targetType: "ROOMMATE_PROFILE",
      category: "IMPERSONATION",
      details: "Cần xem lại hồ sơ.",
      status: "OPEN",
      resolutionNote: null,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      resolvedAt: null,
      reporter: { displayName: "Người báo cáo", memberSince: "2026-01-01T00:00:00.000Z" },
      subject: { requestId: 42, messageId: null }
    };
    apiMocks.listAdminReports.mockResolvedValue({
      data: [report],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.getAdminReport.mockResolvedValue({
      ...report,
      subject: { ...report.subject, profileTenantId: 2201 },
      events: []
    });
    apiMocks.moderateProfile.mockResolvedValue({ targetType: "ROOMMATE_PROFILE", state: "HIDDEN" });

    render(<AdminRoommateReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xem & xử lý" }));

    expect(await screen.findByRole("button", { name: "Ẩn nội dung được báo cáo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Khôi phục hiển thị" })).toBeInTheDocument();
    expect(screen.queryByText("2201")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ghi chú xử lý hoặc kiểm duyệt"), {
      target: { value: "Ẩn để kiểm tra thêm." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Ẩn nội dung được báo cáo" }));

    await waitFor(() =>
      expect(apiMocks.moderateProfile).toHaveBeenCalledWith(2201, {
        state: "HIDDEN",
        note: "Ẩn để kiểm tra thêm.",
        reportId: 17
      })
    );
  });
});

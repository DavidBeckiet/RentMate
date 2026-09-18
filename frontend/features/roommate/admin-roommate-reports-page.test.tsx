import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminRoommateReport } from "../../types/api";
const roommateApi = vi.hoisted(() => ({ listAdminReports: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { roommates: roommateApi }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
import { AdminRoommateReportsPage } from "./admin-roommate-reports-page";
const admin = {
  id: 1,
  displayName: "Admin",
  role: "ADMIN" as const,
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const report: AdminRoommateReport = {
  id: 18,
  targetType: "ROOMMATE_MESSAGE",
  category: "SPAM",
  details: "Cần xem xét.",
  status: "OPEN",
  resolutionNote: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  resolvedAt: null,
  reporter: { displayName: "Người báo cáo", memberSince: null },
  subject: { requestId: 42, messageId: 301 },
  riskSummary: {
    rulesVersion: "ROOMMATE_RISK_V2_1",
    reviewPriority: "ELEVATED",
    partialEvaluation: false,
    flags: [],
    evaluatedAt: "2026-08-20T01:00:00.000Z"
  }
};
describe("AdminRoommateReportsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: admin,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    roommateApi.listAdminReports.mockResolvedValue({
      data: [report],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });
  it("preserves review priority in the URL-backed queue request", async () => {
    render(<AdminRoommateReportsPage />);
    expect(await screen.findByText("Ưu tiên xem sớm")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ưu tiên xem xét"), { target: { value: "ELEVATED" } });
    await waitFor(() =>
      expect(roommateApi.listAdminReports).toHaveBeenLastCalledWith(
        { status: "OPEN", reviewPriority: "ELEVATED", page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    );
    expect(screen.getByRole("link", { name: "Xem và xử lý" })).toHaveAttribute(
      "href",
      "/admin/roommate-reports/18?reviewPriority=ELEVATED"
    );
  });
});

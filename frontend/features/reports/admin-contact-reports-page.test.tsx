import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminContactReport } from "../../types/api";
const adminApi = vi.hoisted(() => ({ listContactReports: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: adminApi }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
import { AdminContactReportsPage } from "./admin-contact-reports-page";
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
const report: AdminContactReport = {
  id: 8,
  inquiryId: 12,
  listingId: 42,
  reporter: { id: 7, email: "tenant@example.com", isActive: true },
  message: null,
  category: "FRAUD",
  details: "Yêu cầu đặt cọc ngoài hệ thống.",
  status: "RESOLVED",
  resolutionNote: "Đã kiểm tra",
  assignedAdminId: 1,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: "2026-08-23T01:00:00.000Z"
};
describe("AdminContactReportsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: admin,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    adminApi.listContactReports.mockResolvedValue({
      data: [report],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });
  it("uses a view-only label for processed records", async () => {
    render(<AdminContactReportsPage />);
    expect(await screen.findByRole("heading", { name: "Liên hệ về tin #42" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem báo cáo" })).toHaveAttribute("href", "/admin/contact-reports/8");
  });
});

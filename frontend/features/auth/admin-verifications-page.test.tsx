import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification, ApiPage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listVerifications: vi.fn(),
  getVerification: vi.fn(),
  reviewVerification: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminVerificationsPage } from "./admin-verifications-page";

const verification: AdminLandlordVerification = {
  id: 9,
  landlord: { id: 7, email: "owner@example.com", phone: "+84901234567", isActive: true },
  displayName: "Nguyễn Văn An",
  requestNote: "Đề nghị duyệt hồ sơ.",
  status: "PENDING",
  decisionNote: null,
  reviewedByAdminId: null,
  submittedAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null,
  updatedAt: "2026-08-23T00:00:00.000Z"
};
const page: ApiPage<AdminLandlordVerification> = {
  data: [verification],
  pagination: { page: 1, pageSize: 20, hasNextPage: false }
};

describe("AdminVerificationsPage", () => {
  beforeEach(() => {
    apiMocks.listVerifications.mockReset();
    apiMocks.getVerification.mockReset();
    apiMocks.reviewVerification.mockReset();
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
    apiMocks.listVerifications.mockResolvedValue(page);
    apiMocks.getVerification.mockResolvedValue(verification);
    apiMocks.reviewVerification.mockResolvedValue({
      ...verification,
      status: "APPROVED",
      decisionNote: "Thông tin phù hợp.",
      reviewedByAdminId: 1,
      reviewedAt: "2026-08-23T01:00:00.000Z"
    });
  });

  it("loads the pending queue and approves with an auditable note", async () => {
    render(<AdminVerificationsPage />);
    expect(await screen.findByRole("heading", { name: "Nguyễn Văn An" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem & duyệt" }));
    expect(await screen.findByRole("heading", { name: "Yêu cầu #9" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ghi chú quyết định"), { target: { value: "Thông tin phù hợp." } });
    fireEvent.click(screen.getByRole("button", { name: "Duyệt hồ sơ" }));
    await waitFor(() =>
      expect(apiMocks.reviewVerification).toHaveBeenCalledWith(9, { status: "APPROVED", note: "Thông tin phù hợp." })
    );
  });

  it("blocks non-admin users before loading the queue", () => {
    useAuthMock.mockReturnValue({ ...useAuthMock(), user: { ...useAuthMock().user!, role: "TENANT" } });
    render(<AdminVerificationsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listVerifications).not.toHaveBeenCalled();
  });
});

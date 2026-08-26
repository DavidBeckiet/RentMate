import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminSupportRequest, ApiPage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listSupportRequests: vi.fn(), updateSupportRequestStatus: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminSupportRequestsPage } from "./admin-support-requests-page";

const admin = {
  id: 1,
  displayName: null,
  role: "ADMIN" as const,
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const request: AdminSupportRequest = {
  id: 17,
  requester: { id: 11, role: "TENANT", email: "tenant@example.com", isActive: true },
  category: "TECHNICAL",
  subject: "Không mở được cuộc trò chuyện",
  message: "Trang bị lỗi khi tôi muốn gửi tin nhắn.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
  resolvedAt: null
};

const page: ApiPage<AdminSupportRequest> = {
  data: [request],
  pagination: { page: 1, pageSize: 20, hasNextPage: false }
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: admin,
    error: null,
    refresh: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("AdminSupportRequestsPage", () => {
  beforeEach(() => {
    apiMocks.listSupportRequests.mockReset();
    apiMocks.updateSupportRequestStatus.mockReset();
    useAuthMock.mockReturnValue(authValue());
    apiMocks.listSupportRequests.mockResolvedValue(page);
    apiMocks.updateSupportRequestStatus.mockResolvedValue({
      ...request,
      status: "RESOLVED",
      resolutionNote: "Đã hướng dẫn người dùng.",
      assignedAdminId: 1,
      resolvedAt: "2026-08-26T01:00:00.000Z"
    });
  });

  it("loads the queue and resolves a selected support request", async () => {
    render(<AdminSupportRequestsPage />);
    expect(await screen.findByText("Không mở được cuộc trò chuyện")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem & xử lý" }));
    expect(screen.getAllByText("Trang bị lỗi khi tôi muốn gửi tin nhắn.")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Ghi chú xử lý"), { target: { value: "Đã hướng dẫn người dùng." } });
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu đã xử lý" }));

    await waitFor(() =>
      expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledWith(17, {
        status: "RESOLVED",
        note: "Đã hướng dẫn người dùng."
      })
    );
  });

  it("does not load the support queue for a non-admin", () => {
    useAuthMock.mockReturnValue(authValue({ user: { ...admin, role: "TENANT" } }));
    render(<AdminSupportRequestsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listSupportRequests).not.toHaveBeenCalled();
  });
});

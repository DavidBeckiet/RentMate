import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminSupportRequest, ApiPage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listSupportRequests: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const useSearchParamsMock = vi.hoisted(() => vi.fn<() => URLSearchParams>());
const useRouterMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ useRouter: useRouterMock, useSearchParams: useSearchParamsMock }));

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

const baseRequest: AdminSupportRequest = {
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

function page(data: readonly AdminSupportRequest[], pageNumber = 1, hasNextPage = false): ApiPage<AdminSupportRequest> {
  return { data, pagination: { page: pageNumber, pageSize: 20, hasNextPage } };
}

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
    apiMocks.listSupportRequests.mockResolvedValue(page([baseRequest]));
    useAuthMock.mockReturnValue(authValue());
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    useRouterMock.mockReturnValue({ push: vi.fn() });
  });

  it("loads the OPEN queue by default and opens a dedicated detail URL with return context", async () => {
    render(<AdminSupportRequestsPage />);

    expect(await screen.findByText(baseRequest.subject)).toBeInTheDocument();
    expect(apiMocks.listSupportRequests).toHaveBeenCalledWith(
      { status: "OPEN", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );
    expect(screen.getByRole("link", { name: "Mở hồ sơ" })).toHaveAttribute(
      "href",
      "/admin/support-requests/17?returnStatus=OPEN&returnPage=1&returnPageSize=20"
    );
    expect(screen.queryByText("Yêu cầu trong trang")).not.toBeInTheDocument();
    expect(screen.queryByText("900000000")).not.toBeInTheDocument();
  });

  it("uses URL status/page state, maps every requester role, and uses read-only wording for final records", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("status=RESOLVED&page=2&pageSize=20"));
    apiMocks.listSupportRequests.mockResolvedValue(
      page(
        [
          {
            ...baseRequest,
            requester: { ...baseRequest.requester, role: "LANDLORD", email: "owner@example.com" },
            status: "RESOLVED"
          },
          {
            ...baseRequest,
            id: 18,
            requester: { ...baseRequest.requester, id: 12, role: "ADMIN", email: "admin-requester@example.com" },
            status: "RESOLVED"
          }
        ],
        2
      )
    );

    render(<AdminSupportRequestsPage />);

    expect(await screen.findByText("Chủ trọ")).toBeInTheDocument();
    expect(screen.getByText("Quản trị viên")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Xem hồ sơ" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Mới" })).toHaveAttribute("href", "/admin/support-requests");
    expect(screen.getByRole("link", { name: "Đang xem xét" })).toHaveAttribute(
      "href",
      "/admin/support-requests?status=IN_PROGRESS"
    );
    expect(document.querySelectorAll('time[datetime="2026-08-26T00:00:00.000Z"]')).not.toHaveLength(0);
    expect(apiMocks.listSupportRequests).toHaveBeenCalledWith(
      { status: "RESOLVED", page: 2, pageSize: 20 },
      expect.any(AbortSignal)
    );
  });

  it("falls back safely from invalid parameters and offers a previous page for an empty later page", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("status=UNKNOWN&page=0&pageSize=1000"));
    apiMocks.listSupportRequests.mockResolvedValue(page([], 1));
    const { rerender } = render(<AdminSupportRequestsPage />);
    expect(await screen.findByText("Không có yêu cầu ở trạng thái này")).toBeInTheDocument();
    expect(apiMocks.listSupportRequests).toHaveBeenCalledWith(
      { status: "OPEN", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );

    useSearchParamsMock.mockReturnValue(new URLSearchParams("status=IN_PROGRESS&page=3"));
    apiMocks.listSupportRequests.mockResolvedValue(page([], 3));
    rerender(<AdminSupportRequestsPage />);
    expect(await screen.findByText("Trang này không còn yêu cầu hỗ trợ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang trước" })).toHaveAttribute(
      "href",
      "/admin/support-requests?status=IN_PROGRESS&page=2"
    );
  });

  it("keeps page 101 when moving forward from page 100", async () => {
    const push = vi.fn();
    useRouterMock.mockReturnValue({ push });
    useSearchParamsMock.mockReturnValue(new URLSearchParams("page=100"));
    apiMocks.listSupportRequests.mockResolvedValue(page([baseRequest], 100, true));
    const { rerender } = render(<AdminSupportRequestsPage />);

    await screen.findByText(baseRequest.subject);
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(push).toHaveBeenCalledWith("/admin/support-requests?page=101");

    useSearchParamsMock.mockReturnValue(new URLSearchParams("page=101"));
    apiMocks.listSupportRequests.mockResolvedValue(page([baseRequest], 101, false));
    rerender(<AdminSupportRequestsPage />);
    await waitFor(() =>
      expect(apiMocks.listSupportRequests).toHaveBeenLastCalledWith(
        { status: "OPEN", page: 101, pageSize: 20 },
        expect.any(AbortSignal)
      )
    );
  });

  it("renders queue failures with a retry and does not load data for a non-admin", async () => {
    apiMocks.listSupportRequests.mockRejectedValueOnce(new Error("network"));
    render(<AdminSupportRequestsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải hàng đợi hỗ trợ");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(apiMocks.listSupportRequests).toHaveBeenCalledTimes(2));

    apiMocks.listSupportRequests.mockClear();
    useAuthMock.mockReturnValue(authValue({ user: { ...admin, role: "TENANT" } }));
    render(<AdminSupportRequestsPage />);
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.listSupportRequests).not.toHaveBeenCalled();
  });
});

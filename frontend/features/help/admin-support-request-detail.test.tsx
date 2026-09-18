import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminSupportRequest } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getSupportRequest: vi.fn(), updateSupportRequestStatus: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const useSearchParamsMock = vi.hoisted(() => vi.fn<() => URLSearchParams>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ useSearchParams: useSearchParamsMock }));

import { AdminSupportRequestDetail } from "./admin-support-request-detail";

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

const openRequest: AdminSupportRequest = {
  id: 17,
  requester: { id: 11, role: "TENANT", email: "tenant@example.com", isActive: true },
  category: "TECHNICAL",
  subject: "Không mở được cuộc trò chuyện",
  message: "Dòng đầu tiên\nDòng thứ hai rất dài để kiểm tra nội dung gốc.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
  resolvedAt: null
};

const inProgressRequest: AdminSupportRequest = { ...openRequest, status: "IN_PROGRESS" };
const resolvedRequest: AdminSupportRequest = {
  ...openRequest,
  status: "RESOLVED",
  requester: { ...openRequest.requester, role: "ADMIN", isActive: false },
  resolutionNote: "Đã kiểm tra và ghi nhận kết luận nội bộ.",
  assignedAdminId: 99,
  updatedAt: "2026-08-26T01:00:00.000Z",
  resolvedAt: "2026-08-26T01:00:00.000Z"
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

function backendError(status: number, code: string): ApiError {
  return new ApiError({ status, code, message: "test error", requestId: "request-test", category: "backend" });
}

function networkError(): ApiError {
  return new ApiError({ status: null, code: "NETWORK_ERROR", message: "test error", category: "network" });
}

describe("AdminSupportRequestDetail", () => {
  beforeEach(() => {
    apiMocks.getSupportRequest.mockReset();
    apiMocks.updateSupportRequestStatus.mockReset();
    apiMocks.getSupportRequest.mockResolvedValue(openRequest);
    useAuthMock.mockReturnValue(authValue());
    useSearchParamsMock.mockReturnValue(new URLSearchParams("returnStatus=IN_PROGRESS&returnPage=3&returnPageSize=20"));
  });

  it("loads canonical detail directly, preserves original message formatting, requester facts, and safe return context", async () => {
    render(<AdminSupportRequestDetail requestId="17" />);

    const heading = await screen.findByRole("heading", { name: openRequest.subject });
    expect(heading).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(apiMocks.getSupportRequest).toHaveBeenCalledWith(17);
    expect(
      screen.getByText(
        (_, element) => element?.textContent === "Dòng đầu tiên\nDòng thứ hai rất dài để kiểm tra nội dung gốc."
      ).className
    ).toContain("message");
    expect(screen.getByText("Người thuê")).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
    expect(document.querySelectorAll('time[datetime="2026-08-26T00:00:00.000Z"]')).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: "Về yêu cầu hỗ trợ" })).toHaveAttribute(
      "href",
      "/admin/support-requests?status=IN_PROGRESS&page=3"
    );
  });

  it("starts review without a note and reloads canonical state after success", async () => {
    apiMocks.getSupportRequest.mockResolvedValueOnce(openRequest).mockResolvedValueOnce(inProgressRequest);
    apiMocks.updateSupportRequestStatus.mockResolvedValue(inProgressRequest);
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    const startButton = screen.getByRole("button", { name: "Bắt đầu xem xét" });
    startButton.focus();
    fireEvent.click(startButton);

    await waitFor(() =>
      expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledWith(17, { status: "IN_PROGRESS", note: null })
    );
    await waitFor(() => expect(apiMocks.getSupportRequest).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Đang xem xét")).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: openRequest.subject }));
  });

  it("requires a note, confirms completion, and canonical-reloads the resolved case", async () => {
    apiMocks.getSupportRequest.mockResolvedValueOnce(openRequest).mockResolvedValueOnce(resolvedRequest);
    apiMocks.updateSupportRequestStatus.mockResolvedValue(resolvedRequest);
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất hồ sơ" }));
    expect(screen.getByText("Cần nhập ghi chú kết luận nội bộ trước khi hoàn tất hồ sơ.")).toBeInTheDocument();
    expect(apiMocks.updateSupportRequestStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Ghi chú kết luận nội bộ"), { target: { value: "  Kết luận nội bộ.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất hồ sơ" }));
    expect(await screen.findByRole("dialog", { name: "Hoàn tất hồ sơ?" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hoàn tất hồ sơ" })));

    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất hồ sơ" }));
    fireEvent.click(
      await screen
        .findByRole("dialog", { name: "Hoàn tất hồ sơ?" })
        .then(() => screen.getAllByRole("button", { name: "Hoàn tất hồ sơ" }).at(-1)!)
    );
    await waitFor(() =>
      expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledWith(17, {
        status: "RESOLVED",
        note: "Kết luận nội bộ."
      })
    );
    expect(await screen.findByText("Quản trị viên hoàn tất #99")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ghi chú kết luận nội bộ")).not.toBeInTheDocument();
  });

  it("allows an IN_PROGRESS case to finish directly with a bounded internal note", async () => {
    apiMocks.getSupportRequest.mockResolvedValueOnce(inProgressRequest).mockResolvedValueOnce(resolvedRequest);
    apiMocks.updateSupportRequestStatus.mockResolvedValue(resolvedRequest);
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    expect(screen.queryByRole("button", { name: "Bắt đầu xem xét" })).not.toBeInTheDocument();
    const noteField = screen.getByLabelText("Ghi chú kết luận nội bộ");
    expect(noteField).toHaveAttribute("maxlength", "2000");
    fireEvent.change(noteField, { target: { value: "Đã kiểm tra đầy đủ." } });
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất hồ sơ" }));
    fireEvent.click(
      await screen
        .findByRole("dialog", { name: "Hoàn tất hồ sơ?" })
        .then(() => screen.getAllByRole("button", { name: "Hoàn tất hồ sơ" }).at(-1)!)
    );

    await waitFor(() =>
      expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledWith(17, {
        status: "RESOLVED",
        note: "Đã kiểm tra đầy đủ."
      })
    );
  });

  it("uses canonical GET after a 409 without repeating the mutation", async () => {
    apiMocks.getSupportRequest.mockResolvedValueOnce(openRequest).mockResolvedValueOnce(resolvedRequest);
    apiMocks.updateSupportRequestStatus.mockRejectedValue(backendError(409, "CONCURRENT_MODIFICATION"));
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu xem xét" }));
    expect(
      await screen.findByText("Hồ sơ đã thay đổi. Hãy xem trạng thái mới trước khi thao tác tiếp.")
    ).toBeInTheDocument();
    expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Bắt đầu xem xét" })).not.toBeInTheDocument();
  });

  it("keeps mutations locked after uncertain recovery failure until a canonical retry succeeds", async () => {
    apiMocks.getSupportRequest
      .mockResolvedValueOnce(openRequest)
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(openRequest);
    apiMocks.updateSupportRequestStatus.mockRejectedValue(networkError());
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu xem xét" }));
    expect(await screen.findByRole("button", { name: "Tải lại hồ sơ" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("lần tải thành công gần nhất");
    expect(screen.getByRole("button", { name: "Bắt đầu xem xét" })).toBeDisabled();
    expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tải lại hồ sơ" }));
    await waitFor(() => expect(apiMocks.getSupportRequest).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "Bắt đầu xem xét" })).not.toBeDisabled();
    expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "Phiên đăng nhập không còn hợp lệ"],
    [403, "Không có quyền xem hồ sơ hỗ trợ"],
    [404, "Không tìm thấy hồ sơ hỗ trợ"]
  ])("removes stale detail after canonical recovery returns %s", async (status, title) => {
    apiMocks.getSupportRequest
      .mockResolvedValueOnce(openRequest)
      .mockRejectedValueOnce(backendError(status, "RECOVERY_ERROR"));
    apiMocks.updateSupportRequestStatus.mockResolvedValue(openRequest);
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu xem xét" }));

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: openRequest.subject })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu xem xét" })).not.toBeInTheDocument();
    expect(screen.queryByText(openRequest.message)).not.toBeInTheDocument();
  });

  it.each([
    [401, "Phiên đăng nhập không còn hợp lệ"],
    [403, "Không có quyền xem hồ sơ hỗ trợ"]
  ])("locks the workspace when PATCH returns %s", async (status, title) => {
    apiMocks.updateSupportRequestStatus.mockRejectedValue(backendError(status, "AUTH_ERROR"));
    render(<AdminSupportRequestDetail requestId="17" />);
    await screen.findByRole("heading", { name: openRequest.subject });

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu xem xét" }));

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(apiMocks.updateSupportRequestStatus).toHaveBeenCalledTimes(1);
    expect(apiMocks.getSupportRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Bắt đầu xem xét" })).not.toBeInTheDocument();
  });

  it("renders coherent not-found and forbidden states", async () => {
    apiMocks.getSupportRequest.mockRejectedValue(backendError(404, "RESOURCE_NOT_FOUND"));
    const { rerender } = render(<AdminSupportRequestDetail requestId="17" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Không tìm thấy hồ sơ hỗ trợ" })).toBeInTheDocument();

    useAuthMock.mockReturnValue(authValue({ user: { ...admin, role: "TENANT" } }));
    rerender(<AdminSupportRequestDetail requestId="17" />);
    expect(screen.getByRole("heading", { level: 1, name: "Không có quyền truy cập hồ sơ hỗ trợ" })).toBeInTheDocument();
  });

  it("distinguishes an expired or missing session from a missing record", async () => {
    apiMocks.getSupportRequest.mockRejectedValue(backendError(401, "AUTHENTICATION_REQUIRED"));
    render(<AdminSupportRequestDetail requestId="17" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Phiên đăng nhập không còn hợp lệ" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Không tìm thấy hồ sơ hỗ trợ")).not.toBeInTheDocument();
  });

  it("renders RESOLVED as read-only with factual admin wording", async () => {
    apiMocks.getSupportRequest.mockResolvedValue(resolvedRequest);
    render(<AdminSupportRequestDetail requestId="17" />);
    expect(await screen.findByText("Quản trị viên hoàn tất #99")).toBeInTheDocument();
    expect(screen.getByText("Ngừng hoạt động")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu xem xét" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hoàn tất hồ sơ" })).not.toBeInTheDocument();
  });

  it("drops invalid return context before rendering the back link", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("returnUrl=https://unsafe.test&returnStatus=UNKNOWN"));
    render(<AdminSupportRequestDetail requestId="17" />);

    await screen.findByRole("heading", { name: openRequest.subject });
    expect(screen.getByRole("link", { name: "Về yêu cầu hỗ trợ" })).toHaveAttribute("href", "/admin/support-requests");
  });
});

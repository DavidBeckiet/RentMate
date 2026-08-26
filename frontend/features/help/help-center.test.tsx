import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { ApiError } from "../../lib/api/client";

const apiMocks = vi.hoisted(() => ({ createSupportRequest: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { contact: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { HelpCenter } from "./help-center";

const tenant = {
  id: 11,
  displayName: "Người thuê",
  role: "TENANT" as const,
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: tenant,
    error: null,
    refresh: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  apiMocks.createSupportRequest.mockReset();
  useAuthMock.mockReturnValue(authValue());
});

describe("HelpCenter", () => {
  it("renders FAQ groups and the safety checklist", () => {
    render(<HelpCenter />);

    expect(screen.getByRole("heading", { name: "Tìm câu trả lời, thuê phòng an toàn hơn." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Giải đáp nhanh" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Checklist trước khi thuê" })).toBeInTheDocument();
    expect(screen.getByText(/Không chuyển tiền đặt cọc/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Đã xem" })).toHaveAttribute("href", "/recently-viewed");
    expect(document.querySelectorAll("details")).toHaveLength(7);
  });

  it("keeps support request entry point anchored for the next help workflow", () => {
    render(<HelpCenter />);

    expect(screen.getByRole("link", { name: "Gửi yêu cầu hỗ trợ" })).toHaveAttribute("href", "#support-request");
    expect(
      screen.getByText("Không gửi mật khẩu, mã OTP, giấy tờ nhạy cảm hoặc thông tin ngân hàng qua cuộc trò chuyện.")
    ).toBeInTheDocument();
  });

  it("submits an authenticated support request and shows its receipt", async () => {
    apiMocks.createSupportRequest.mockResolvedValue({
      id: 17,
      status: "OPEN",
      createdAt: "2026-08-26T00:00:00.000Z"
    });
    render(<HelpCenter />);

    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Không thể đăng nhập" } });
    fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Tôi gặp lỗi khi mở trang đăng nhập." } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu hỗ trợ" }));

    await waitFor(() =>
      expect(apiMocks.createSupportRequest).toHaveBeenCalledWith({
        category: "ACCOUNT",
        subject: "Không thể đăng nhập",
        message: "Tôi gặp lỗi khi mở trang đăng nhập."
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("#17");
  });

  it("keeps the support form behind login for anonymous visitors", () => {
    useAuthMock.mockReturnValue(authValue({ status: "anonymous", user: null }));
    render(<HelpCenter />);

    expect(screen.getByRole("link", { name: "Đăng nhập để gửi yêu cầu" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Tiêu đề")).not.toBeInTheDocument();
  });

  it("maps backend errors to a safe retry message", async () => {
    apiMocks.createSupportRequest.mockRejectedValue(
      new ApiError({ status: 429, code: "RATE_LIMITED", message: "private", category: "backend" })
    );
    render(<HelpCenter />);

    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Cần hỗ trợ" } });
    fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Tôi cần RentMate hỗ trợ." } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu hỗ trợ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("gửi khá nhiều yêu cầu");
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });
});

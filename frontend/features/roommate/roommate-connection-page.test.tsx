import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ getCurrentConnection: vi.fn(), leaveInterest: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates/connection" }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RoommateConnectionPage } from "./roommate-connection-page";
import { RoommateWorkspace } from "./roommate-workspace";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateConnectionPage", () => {
  beforeEach(() => {
    apiMocks.getCurrentConnection.mockReset();
    apiMocks.leaveInterest.mockReset();
    useAuthMock.mockReturnValue(auth());
  });

  it("shows the current connection with safety context and no contact disclosure", async () => {
    apiMocks.getCurrentConnection.mockResolvedValue({
      interestId: 91,
      requestId: 42,
      connectedAt: "2026-08-22T00:00:00.000Z",
      counterpart: roommateProfile({ displayName: "Minh" }),
      request: roommateRequest({ status: "MATCHED" })
    });
    render(<RoommateConnectionPage />);
    expect(await screen.findByRole("heading", { name: "Kết nối hiện tại" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc."
      )
    ).toBeInTheDocument();
    const safetySummary = screen.getByText("Xem hướng dẫn an toàn đầy đủ");
    const safetyDetails = safetySummary.closest("details");
    expect(safetyDetails).not.toHaveAttribute("open");
    fireEvent.click(safetySummary);
    expect(safetyDetails).toHaveAttribute("open");
    expect(
      screen.getByText(
        "RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính nhạy cảm.")).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
  });

  it("uses a neutral empty state when there is no active connection", async () => {
    apiMocks.getCurrentConnection.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    render(<RoommateConnectionPage />);
    expect(await screen.findByRole("heading", { name: "Bạn chưa kết nối với ai" })).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("keeps the roommate page navigation visible when loading fails", async () => {
    apiMocks.getCurrentConnection.mockRejectedValue(
      new ApiError({ status: 503, code: "DEPENDENCY_UNAVAILABLE", message: "private", category: "backend" })
    );
    render(
      <RoommateWorkspace>
        <RoommateConnectionPage />
      </RoommateWorkspace>
    );

    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kết nối hiện tại" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Điều hướng ở ghép" });
    expect(within(navigation).getByRole("link", { name: "Kết nối" })).toHaveAttribute("aria-current", "page");
  });

  it("requires confirmation before leaving the current connection", async () => {
    apiMocks.getCurrentConnection.mockResolvedValue({
      interestId: 91,
      requestId: 42,
      connectedAt: "2026-08-22T00:00:00.000Z",
      counterpart: roommateProfile({ displayName: "Minh" }),
      request: roommateRequest({ status: "MATCHED" })
    });
    apiMocks.leaveInterest.mockResolvedValue({ id: 91, status: "LEFT" });
    render(<RoommateConnectionPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Kết thúc kết nối" }));
    expect(apiMocks.leaveInterest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận kết thúc" }));
    await waitFor(() => expect(apiMocks.leaveInterest).toHaveBeenCalledWith(91));
    expect(await screen.findByRole("heading", { name: "Bạn chưa kết nối với ai" })).toBeInTheDocument();
  });
});

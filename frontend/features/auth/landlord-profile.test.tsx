import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  updateCurrent: vi.fn(),
  getCurrentVerification: vi.fn(),
  submitVerification: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { users: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { LandlordProfile } from "./landlord-profile";

const refresh = vi.fn<() => Promise<void>>();
const updateUser = vi.fn<(user: UserProfile) => void>();
const landlord: UserProfile = {
  id: 7,
  displayName: "Nguyễn Văn An",
  role: "LANDLORD",
  email: "owner@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: landlord, error: null, refresh, updateUser, logout: vi.fn(), ...overrides };
}

function changePhone(value: string) {
  fireEvent.change(screen.getByLabelText("Số điện thoại (bắt buộc)"), { target: { value } });
}

function submit() {
  fireEvent.submit(screen.getByLabelText("Số điện thoại (bắt buộc)").closest("form")!);
}

function backendError(status: number, details: ConstructorParameters<typeof ApiError>[0]["details"] = []) {
  return new ApiError({
    status,
    code: "VALIDATION_FAILED",
    message: "Invalid",
    details,
    requestId: "req-profile",
    category: "backend"
  });
}

describe("LandlordProfile", () => {
  beforeEach(() => {
    apiMocks.updateCurrent.mockReset();
    apiMocks.getCurrentVerification.mockReset();
    apiMocks.submitVerification.mockReset();
    apiMocks.getCurrentVerification.mockResolvedValue(null);
    refresh.mockReset();
    updateUser.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(authValue());
  });

  it.each([
    ["loading", authValue({ status: "loading", user: null }), "Đang kiểm tra tài khoản"],
    ["anonymous", authValue({ status: "anonymous", user: null }), "Đăng nhập để quản lý hồ sơ"],
    ["TENANT", authValue({ user: { ...landlord, role: "TENANT" } }), "Trang này dành cho tài khoản người cho thuê"],
    ["ADMIN", authValue({ user: { ...landlord, role: "ADMIN" } }), "Trang này dành cho tài khoản người cho thuê"]
  ] as const)("gates %s without a profile mutation", (_label, auth, expected) => {
    useAuthMock.mockReturnValue(auth);
    render(<LandlordProfile />);
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    expect(apiMocks.updateCurrent).not.toHaveBeenCalled();
  });

  it("shows a safe auth error with an explicit refresh", () => {
    useAuthMock.mockReturnValue(
      authValue({
        status: "error",
        user: null,
        error: new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
      })
    );
    render(<LandlordProfile />);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(apiMocks.updateCurrent).not.toHaveBeenCalled();
  });

  it("keeps email read-only and PATCHes the account name with the trimmed phone", async () => {
    apiMocks.updateCurrent.mockResolvedValue({
      ...landlord,
      phone: "+84909999999",
      updatedAt: "2026-08-02T00:00:00.000Z"
    });
    render(<LandlordProfile />);
    expect(screen.getByLabelText("Email đăng nhập")).toHaveValue("owner@example.com");
    expect(screen.getByLabelText("Email đăng nhập")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Họ và tên (bắt buộc)"), { target: { value: "  Nguyễn Văn Bình  " } });
    changePhone("  +84909999999  ");
    submit();
    await waitFor(() => expect(apiMocks.updateCurrent).toHaveBeenCalledOnce());
    expect(apiMocks.updateCurrent).toHaveBeenCalledWith(
      { displayName: "Nguyễn Văn Bình", phone: "+84909999999" },
      expect.any(AbortSignal)
    );
    expect(await screen.findByText("Đã cập nhật hồ sơ.")).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ phone: "+84909999999" }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(["", "84901234567", "+012345678", "+8490", "+8490123456789012"])(
    "rejects invalid phone %s locally",
    (phone) => {
      render(<LandlordProfile />);
      changePhone(phone);
      submit();
      expect(screen.getByText(/Vui lòng nhập số điện thoại|\+84901234567/)).toBeInTheDocument();
      expect(apiMocks.updateCurrent).not.toHaveBeenCalled();
    }
  );

  it("uses returned canonical phone and updatedAt to identify a no-op", async () => {
    apiMocks.updateCurrent.mockResolvedValue(landlord);
    render(<LandlordProfile />);
    submit();
    expect(await screen.findByText("Không có thay đổi cần lưu.")).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith(landlord);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("blocks duplicate submissions while PATCH is pending", async () => {
    let resolve!: (value: UserProfile) => void;
    apiMocks.updateCurrent.mockReturnValue(
      new Promise<UserProfile>((done) => {
        resolve = done;
      })
    );
    render(<LandlordProfile />);
    changePhone("+84909999999");
    submit();
    submit();
    expect(apiMocks.updateCurrent).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    resolve({ ...landlord, phone: "+84909999999" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu hồ sơ" })).toBeEnabled());
  });

  it("maps a 422 phone detail without exposing unrelated backend details", async () => {
    apiMocks.updateCurrent.mockRejectedValue(
      backendError(422, [
        { field: "phone", code: "INVALID_VALUE", message: "Số điện thoại chưa hợp lệ." },
        { field: "role", code: "FORBIDDEN", message: "private role detail" }
      ])
    );
    render(<LandlordProfile />);
    changePhone("+84909999999");
    submit();
    expect(
      await screen.findByText("Số điện thoại chưa đúng. Vui lòng nhập theo ví dụ +84901234567.")
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private role detail");
  });

  it.each([
    [backendError(401), "Phiên đăng nhập không còn hợp lệ", true],
    [backendError(403), "Bạn không có quyền cập nhật hồ sơ", false],
    [
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" }),
      "Không thể xác nhận việc cập nhật",
      false
    ]
  ] as const)("handles safe mutation failures without replay", async (error, message, shouldRefresh) => {
    apiMocks.updateCurrent.mockRejectedValue(error);
    render(<LandlordProfile />);
    changePhone("+84909999999");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(apiMocks.updateCurrent).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(shouldRefresh ? 1 : 0);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";

const apiMocks = vi.hoisted(() => ({ updateCurrent: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { users: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { TenantProfile } from "./tenant-profile";

const refresh = vi.fn<() => Promise<void>>();
const updateUser = vi.fn<(user: UserProfile) => void>();
const tenant: UserProfile = {
  id: 1,
  displayName: "Nguyễn Văn An",
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function auth(user: UserProfile | null = tenant): AuthContextValue {
  return { status: user ? "authenticated" : "anonymous", user, error: null, refresh, updateUser, logout: vi.fn() };
}

describe("TenantProfile", () => {
  beforeEach(() => {
    apiMocks.updateCurrent.mockReset();
    refresh.mockReset();
    updateUser.mockReset();
    useAuthMock.mockReturnValue(auth());
  });

  it("shows identity metadata and saves the canonical account profile", async () => {
    const returned = {
      ...tenant,
      displayName: "Nguyễn Văn Bình",
      phone: "+84901234567",
      updatedAt: "2026-08-25T00:00:00.000Z"
    };
    apiMocks.updateCurrent.mockResolvedValue(returned);
    render(<TenantProfile />);
    expect(screen.getByRole("heading", { name: "Nguyễn Văn An" })).toBeInTheDocument();
    expect(screen.getByText("Người thuê")).toBeInTheDocument();
    expect(screen.getByText("01/08/2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Email đăng nhập")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Họ và tên (bắt buộc)"), { target: { value: " Nguyễn Văn Bình " } });
    fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: " +84901234567 " } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() =>
      expect(apiMocks.updateCurrent).toHaveBeenCalledWith(
        { displayName: "Nguyễn Văn Bình", phone: "+84901234567" },
        expect.any(AbortSignal)
      )
    );
    expect(updateUser).toHaveBeenCalledWith(returned);
    expect(screen.getByRole("status")).toHaveTextContent("Đã cập nhật hồ sơ");
  });

  it("supports a legacy null display name without blocking a phone-only update", async () => {
    const legacy = { ...tenant, displayName: null };
    apiMocks.updateCurrent.mockResolvedValue({ ...legacy, phone: "+84901234567" });
    useAuthMock.mockReturnValue(auth(legacy));
    render(<TenantProfile />);
    expect(screen.getByRole("heading", { name: "tenant@example.com" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: "+84901234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() =>
      expect(apiMocks.updateCurrent).toHaveBeenCalledWith({ phone: "+84901234567" }, expect.any(AbortSignal))
    );
  });

  it("shows a safe API error and does not replace the shell identity", async () => {
    apiMocks.updateCurrent.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    render(<TenantProfile />);
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận việc cập nhật");
    expect(document.body).not.toHaveTextContent("private");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("gates anonymous users before exposing profile fields", () => {
    useAuthMock.mockReturnValue(auth(null));
    render(<TenantProfile />);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(apiMocks.updateCurrent).not.toHaveBeenCalled();
  });
});

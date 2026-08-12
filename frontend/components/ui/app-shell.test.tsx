import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const navigationMocks = vi.hoisted(() => ({ pathname: vi.fn(() => "/") }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({ usePathname: navigationMocks.pathname }));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AppShell } from "./app-shell";

const refresh = vi.fn<() => Promise<void>>();
const logout = vi.fn<() => Promise<void>>();
const tenant: UserProfile = {
  id: 17,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(value: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "anonymous", user: null, error: null, refresh, logout, ...value };
}

describe("AppShell", () => {
  beforeEach(() => {
    navigationMocks.pathname.mockReturnValue("/");
    useAuthMock.mockReturnValue(authValue());
    refresh.mockReset();
    logout.mockReset();
  });

  it("provides accessible shell landmarks and current home navigation", () => {
    render(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Bỏ qua đến nội dung chính" })).toHaveAttribute("href", "#main-content");
    expect(screen.getAllByRole("link", { name: "RentMate" })[0]).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Trang chủ" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the mobile menu with ARIA state and closes it with Escape", () => {
    render(<AppShell>Nội dung trang</AppShell>);
    const toggle = screen.getByRole("button", { name: "Mở menu điều hướng" });
    const navigation = screen.getByRole("navigation", { name: "Điều hướng chính" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", navigation.id);
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Đóng menu điều hướng" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Mở menu điều hướng" })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders authenticated identity and invokes logout", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    logout.mockResolvedValue();
    render(<AppShell>Nội dung trang</AppShell>);
    const navigation = screen.getByRole("navigation", { name: "Điều hướng chính" });

    expect(within(navigation).getByText("tenant@example.com")).toBeInTheDocument();
    expect(within(navigation).getByText("TENANT")).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("renders a safe auth error and retry control", () => {
    useAuthMock.mockReturnValue(
      authValue({
        status: "error",
        error: new ApiError({ status: null, code: "NETWORK_ERROR", message: "Private detail", category: "network" })
      })
    );
    render(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByRole("alert")).toHaveTextContent("Không thể kiểm tra tài khoản.");
    expect(screen.queryByText("Private detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

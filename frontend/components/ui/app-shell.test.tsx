import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "../../types/api";
import { ApiError } from "../../lib/api/transport";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const navigationMocks = vi.hoisted(() => ({
  pathname: vi.fn(() => "/"),
  searchParams: vi.fn(() => new URLSearchParams()),
  replace: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({
  usePathname: navigationMocks.pathname,
  useSearchParams: navigationMocks.searchParams,
  useRouter: () => ({ replace: navigationMocks.replace })
}));
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
    navigationMocks.replace.mockReset();
  });

  it("provides accessible shell landmarks and current home navigation", () => {
    render(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Bỏ qua đến nội dung chính" })).toHaveAttribute("href", "#main-content");
    expect(screen.getAllByRole("link", { name: "RentMate" })[0]).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Trang chủ" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Tìm phòng" })).not.toHaveAttribute("aria-current");
  });

  it("marks the dedicated search navigation at /search", () => {
    navigationMocks.pathname.mockReturnValue("/search");
    render(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Trang chủ" })).not.toHaveAttribute("aria-current");
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

  it("shows the frozen anonymous auth links and marks the current route", () => {
    navigationMocks.pathname.mockReturnValue("/login");
    render(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Đăng ký tìm phòng" })).toHaveAttribute("href", "/register/tenant");
    expect(screen.getByRole("link", { name: "Đăng ký cho thuê" })).toHaveAttribute("href", "/register/landlord");
  });

  it("renders authenticated identity, hides auth links, and navigates home after logout succeeds", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    logout.mockResolvedValue();
    const view = render(<AppShell>Nội dung trang</AppShell>);
    const navigation = screen.getByRole("navigation", { name: "Điều hướng chính" });

    expect(within(navigation).getByText("tenant@example.com")).toBeInTheDocument();
    expect(within(navigation).getByText("TENANT")).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Tin đã lưu" })).toHaveAttribute("href", "/favorites");
    expect(within(navigation).queryByRole("link", { name: "Đăng nhập" })).not.toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));

    useAuthMock.mockReturnValue(authValue());
    view.rerender(<AppShell>Nội dung trang</AppShell>);
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/"));
  });

  it("shows current favorites navigation only to authenticated tenants", () => {
    navigationMocks.pathname.mockReturnValue("/favorites");
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    const view = render(<AppShell>Nội dung trang</AppShell>);
    expect(screen.getByRole("link", { name: "Tin đã lưu" })).toHaveAttribute("aria-current", "page");

    useAuthMock.mockReturnValue(
      authValue({ status: "authenticated", user: { ...tenant, role: "LANDLORD", phone: "+84901234567" } })
    );
    view.rerender(<AppShell>Nội dung trang</AppShell>);
    expect(screen.queryByRole("link", { name: "Tin đã lưu" })).not.toBeInTheDocument();

    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: { ...tenant, role: "ADMIN" } }));
    view.rerender(<AppShell>Nội dung trang</AppShell>);
    expect(screen.queryByRole("link", { name: "Tin đã lưu" })).not.toBeInTheDocument();
  });

  it.each([
    ["/landlord", "Tin của tôi"],
    ["/landlord/listings/42", "Tin của tôi"],
    ["/landlord/profile", "Hồ sơ"]
  ])("shows landlord navigation with the correct current item at %s", (pathname, currentLabel) => {
    navigationMocks.pathname.mockReturnValue(pathname);
    useAuthMock.mockReturnValue(
      authValue({ status: "authenticated", user: { ...tenant, role: "LANDLORD", phone: "+84901234567" } })
    );
    render(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByRole("link", { name: "Tin của tôi" })).toHaveAttribute("href", "/landlord");
    expect(screen.getByRole("link", { name: "Hồ sơ" })).toHaveAttribute("href", "/landlord/profile");
    expect(screen.getByRole("link", { name: currentLabel })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Tin đã lưu" })).not.toBeInTheDocument();
  });

  it("keeps landlord links hidden for anonymous users and admins", () => {
    const view = render(<AppShell>Nội dung trang</AppShell>);
    expect(screen.queryByRole("link", { name: "Tin của tôi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Hồ sơ" })).not.toBeInTheDocument();

    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: { ...tenant, role: "ADMIN" } }));
    view.rerender(<AppShell>Nội dung trang</AppShell>);
    expect(screen.queryByRole("link", { name: "Tin của tôi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Hồ sơ" })).not.toBeInTheDocument();
  });

  it.each([
    ["/admin", "Kiểm duyệt"],
    ["/admin/listings/42", "Kiểm duyệt"],
    ["/admin/users", "Người dùng"],
    ["/admin/reports", "Báo cáo"],
    ["/admin/verifications", "Xác minh"],
    ["/admin/reviews", "Đánh giá"]
  ])("shows admin navigation with the correct current item at %s", (pathname, currentLabel) => {
    navigationMocks.pathname.mockReturnValue(pathname);
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: { ...tenant, role: "ADMIN" } }));
    render(<AppShell>Nội dung trang</AppShell>);
    expect(screen.getByRole("link", { name: "Kiểm duyệt" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Người dùng" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Xác minh" })).toHaveAttribute("href", "/admin/verifications");
    expect(screen.getByRole("link", { name: "Đánh giá" })).toHaveAttribute("href", "/admin/reviews");
    expect(screen.getByRole("link", { name: currentLabel })).toHaveAttribute("aria-current", "page");
  });

  it("blocks duplicate logout submissions while the request is pending", async () => {
    let resolveLogout: (() => void) | undefined;
    logout.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      })
    );
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    render(<AppShell>Nội dung trang</AppShell>);

    const logoutButton = screen.getByRole("button", { name: "Đăng xuất" });
    fireEvent.click(logoutButton);
    fireEvent.click(logoutButton);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang đăng xuất…" })).toBeDisabled();
    resolveLogout?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeEnabled());
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the authenticated user in place and shows a safe error after logout fails", async () => {
    logout.mockResolvedValue();
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    const view = render(<AppShell>Nội dung trang</AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));

    useAuthMock.mockReturnValue(
      authValue({
        status: "authenticated",
        user: tenant,
        error: new ApiError({
          status: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Private detail",
          category: "backend"
        })
      })
    );
    view.rerender(<AppShell>Nội dung trang</AppShell>);

    expect(screen.getByText("tenant@example.com")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Đăng xuất chưa thành công. Vui lòng thử lại.");
    expect(screen.queryByText("Private detail")).not.toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
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

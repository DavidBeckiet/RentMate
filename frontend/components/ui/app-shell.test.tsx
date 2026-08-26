import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/transport";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { UserProfile, UserRole } from "../../types/api";

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

function user(role: UserRole, displayName: string | null = null): UserProfile {
  return {
    id: 17,
    displayName,
    role,
    email: `${role.toLowerCase()}@example.com`,
    phone: role === "LANDLORD" ? "+84901234567" : null,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function authValue(value: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "anonymous", user: null, error: null, refresh, logout, ...value };
}

function authenticate(role: UserRole, displayName: string | null = null) {
  useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: user(role, displayName) }));
}

describe("AppShell", () => {
  beforeEach(() => {
    navigationMocks.pathname.mockReturnValue("/");
    useAuthMock.mockReturnValue(authValue());
    refresh.mockReset();
    logout.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("renders a compact anonymous marketplace shell with semantic landmarks", () => {
    render(<AppShell>Nội dung trang</AppShell>);

    const header = screen.getByRole("banner");
    const navigation = screen.getByRole("navigation", { name: "Điều hướng marketplace" });
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Bỏ qua đến nội dung chính" })).toHaveAttribute("href", "#main-content");
    expect(within(header).getByRole("link", { name: "RentMate — về trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(within(navigation).getByRole("link", { name: "Gần tôi" })).toHaveAttribute("href", "/near-me");
    expect(within(header).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(within(header).getByRole("link", { name: "Đăng ký" })).toHaveAttribute("href", "/register");
    expect(within(navigation).queryByRole("link", { name: "Yêu thích" })).not.toBeInTheDocument();
  });

  it("keeps every anonymous route and auth action accessible in the mobile drawer", () => {
    render(<AppShell>Nội dung trang</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Mở menu điều hướng" }));

    const dialog = screen.getByRole("dialog", { name: "Điều hướng RentMate" });
    const navigation = within(dialog).getByRole("navigation", { name: "Điều hướng marketplace trên di động" });
    expect(within(navigation).getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(within(navigation).getByRole("link", { name: "Gần tôi" })).toHaveAttribute("href", "/near-me");
    expect(within(dialog).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(within(dialog).getByRole("link", { name: "Đăng ký" })).toHaveAttribute("href", "/register");
  });

  it("shows tenant priorities and marks the current consumer route", () => {
    navigationMocks.pathname.mockReturnValue("/favorites");
    authenticate("TENANT");
    render(<AppShell>Nội dung trang</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng marketplace" });
    expect(within(navigation).getByRole("link", { name: "Yêu thích" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("href", "/inquiries");
    expect(within(navigation).queryByRole("link", { name: "Thông báo" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Thông báo" })).toHaveAttribute(
      "href",
      "/notifications"
    );
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "Đăng ký" })).not.toBeInTheDocument();
    expect(screen.getByText("tenant@example.com")).toBeInTheDocument();
  });

  it("prefers the display name and provides a keyboard-accessible role-aware account menu", async () => {
    authenticate("TENANT", "Nguyễn Văn An");
    render(<AppShell>Nội dung trang</AppShell>);
    const trigger = screen.getByRole("button", { name: /Nguyễn Văn An/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu", { name: "Tài khoản" });
    expect(within(menu).getByRole("menuitem", { name: "Hồ sơ của tôi" })).toHaveAttribute("href", "/profile");
    expect(within(menu).getByRole("menuitem", { name: "Thông báo" })).toHaveAttribute("href", "/notifications");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Hồ sơ của tôi" })).toHaveFocus());
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Tài khoản" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("falls back to email for a legacy null account", () => {
    authenticate("TENANT");
    render(<AppShell>Nội dung trang</AppShell>);
    expect(screen.getByRole("button", { name: /tenant@example.com/ })).toBeInTheDocument();
  });

  it.each([
    ["LANDLORD", "Không gian cho thuê", "/landlord"],
    ["ADMIN", "Khu vực quản trị", "/admin"]
  ] as const)("does not give %s the tenant navigation on marketplace routes", (role, workspaceLabel, href) => {
    authenticate(role);
    render(<AppShell>Nội dung trang</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng marketplace" });
    expect(within(navigation).getByRole("link", { name: workspaceLabel })).toHaveAttribute("href", href);
    expect(within(navigation).queryByRole("link", { name: "Yêu thích" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Tin nhắn" })).not.toBeInTheDocument();
  });

  it("uses a compact public auth header without authenticated-only navigation", () => {
    navigationMocks.pathname.mockReturnValue("/login");
    render(<AppShell>Biểu mẫu đăng nhập</AppShell>);

    const header = screen.getByRole("banner");
    const navigation = within(header).getByRole("navigation", { name: "Điều hướng công khai" });
    expect(screen.getByRole("main")).toHaveTextContent("Biểu mẫu đăng nhập");
    expect(within(header).getByRole("link", { name: "RentMate — về trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(within(navigation).getByRole("link", { name: "Gần tôi" })).toHaveAttribute("href", "/near-me");
    const login = within(header).getByRole("link", { name: "Đăng nhập" });
    const register = within(header).getByRole("link", { name: "Đăng ký" });
    expect(login).toHaveAttribute("href", "/login");
    expect(login).toHaveAttribute("aria-current", "page");
    expect(login.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(register).toHaveAttribute("href", "/register");
    expect(register.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(header).queryByText(/Yêu thích|Tin nhắn|Thông báo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("keeps the anonymous auth routes and actions accessible in the mobile drawer", () => {
    navigationMocks.pathname.mockReturnValue("/register/tenant");
    render(<AppShell>Biểu mẫu đăng ký</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Mở menu điều hướng" }));

    const dialog = screen.getByRole("dialog", { name: "Điều hướng RentMate" });
    const navigation = within(dialog).getByRole("navigation", { name: "Điều hướng công khai trên di động" });
    expect(within(navigation).getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(within(navigation).getByRole("link", { name: "Gần tôi" })).toHaveAttribute("href", "/near-me");
    expect(within(dialog).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(within(dialog).getByRole("link", { name: "Đăng ký" })).toHaveAttribute("aria-current", "page");
    expect(within(dialog).queryByText(/Yêu thích|Tin nhắn|Thông báo/)).not.toBeInTheDocument();
  });

  it.each([
    ["/landlord", "Tin đăng"],
    ["/landlord/listings/42", "Tin đăng"],
    ["/landlord/inquiries", "Tin nhắn"],
    ["/landlord/leads", "Leads"],
    ["/landlord/analytics", "Analytics"],
    ["/landlord/profile", "Hồ sơ & xác minh"]
  ])("renders the landlord workspace and active item at %s", (pathname, activeLabel) => {
    navigationMocks.pathname.mockReturnValue(pathname);
    authenticate("LANDLORD");
    render(<AppShell>Nội dung landlord</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng không gian cho thuê" });
    expect(within(navigation).getByRole("link", { name: activeLabel })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("navigation", { name: "Điều hướng marketplace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Nội dung landlord");
  });

  it.each([
    ["/admin", "Kiểm duyệt tin"],
    ["/admin/listings/42", "Kiểm duyệt tin"],
    ["/admin/users", "Người dùng"],
    ["/admin/reports", "Báo cáo"],
    ["/admin/contact-reports", "Báo cáo contact"],
    ["/admin/support-requests", "Yêu cầu hỗ trợ"],
    ["/admin/reviews", "Reviews"],
    ["/admin/verifications", "Xác minh"]
  ])("renders the admin workspace and active item at %s", (pathname, activeLabel) => {
    navigationMocks.pathname.mockReturnValue(pathname);
    authenticate("ADMIN");
    render(<AppShell>Nội dung admin</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng khu vực quản trị" });
    expect(within(navigation).getByRole("link", { name: activeLabel })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).queryByRole("link", { name: "Tin đăng" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Yêu thích" })).not.toBeInTheDocument();
  });

  it("resolves the shared inquiry detail into the landlord workspace", () => {
    navigationMocks.pathname.mockReturnValue("/inquiries/42");
    authenticate("LANDLORD");
    render(<AppShell>Nội dung hội thoại</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng không gian cho thuê" });
    expect(within(navigation).getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveTextContent("Nội dung hội thoại");
  });

  it("keeps shared inquiry detail in the consumer shell for a tenant", () => {
    navigationMocks.pathname.mockReturnValue("/inquiries/42");
    authenticate("TENANT");
    render(<AppShell>Nội dung hội thoại</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng marketplace" });
    expect(within(navigation).getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("aria-current", "page");
  });

  it("does not expose workspace navigation to the wrong actor while preserving route content", () => {
    navigationMocks.pathname.mockReturnValue("/admin");
    authenticate("TENANT");
    render(<AppShell>Nội dung route cũ</AppShell>);

    expect(screen.queryByRole("navigation", { name: "Điều hướng khu vực quản trị" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Điều hướng marketplace" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Nội dung route cũ");
    expect(screen.getByRole("link", { name: "Về marketplace" })).toHaveAttribute("href", "/search");
  });

  it("keeps the requested workspace stable during auth loading without flashing actor links", () => {
    navigationMocks.pathname.mockReturnValue("/landlord");
    useAuthMock.mockReturnValue(authValue({ status: "loading" }));
    render(<AppShell>Nội dung đang kiểm tra</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng không gian cho thuê" });
    expect(within(navigation).getByLabelText("Đang kiểm tra quyền truy cập")).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Tin đăng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Điều hướng marketplace" })).not.toBeInTheDocument();
  });

  it("opens the consumer mobile menu, closes on Escape, and returns focus to its trigger", async () => {
    authenticate("TENANT");
    render(<AppShell>Nội dung trang</AppShell>);
    const trigger = screen.getByRole("button", { name: "Mở menu điều hướng" });

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Điều hướng RentMate" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("navigation", { name: "Điều hướng marketplace trên di động" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Bộ lọc đã lưu" })).toHaveAttribute("href", "/saved-searches");
    expect(within(dialog).getByRole("button", { name: "Đóng điều hướng rentmate" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng RentMate" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("provides an accessible mobile workspace menu with active state", () => {
    navigationMocks.pathname.mockReturnValue("/landlord/leads");
    authenticate("LANDLORD");
    render(<AppShell>Nội dung trang</AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "Mở điều hướng không gian cho thuê" }));
    const dialog = screen.getByRole("dialog", { name: "Không gian cho thuê" });
    const navigation = within(dialog).getByRole("navigation", { name: "Điều hướng không gian cho thuê trên di động" });
    expect(within(navigation).getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
  });

  it("preserves logout behavior and redirects only after auth becomes anonymous", async () => {
    authenticate("TENANT");
    logout.mockResolvedValue();
    const view = render(<AppShell>Nội dung trang</AppShell>);

    fireEvent.click(screen.getByRole("button", { name: /tenant@example.com/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Đăng xuất" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(navigationMocks.replace).not.toHaveBeenCalled();

    useAuthMock.mockReturnValue(authValue());
    view.rerender(<AppShell>Nội dung trang</AppShell>);
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/"));
  });

  it("shows a safe auth bootstrap error with recovery", () => {
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

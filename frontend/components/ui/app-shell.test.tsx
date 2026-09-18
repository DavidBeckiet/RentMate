import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
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

  it("keeps authenticated-only shell controls out of the server tree until hydration", () => {
    authenticate("TENANT");

    const html = renderToString(<AppShell>Private shell content</AppShell>);

    expect(html).not.toContain('aria-label="Thông báo"');
    expect(html).not.toContain("tenant@example.com");
    expect(html).toContain("Private shell content");
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
    expect(within(navigation).queryByRole("link", { name: "Trợ giúp" })).not.toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(within(header).getByRole("link", { name: "Đăng ký" })).toHaveAttribute("href", "/register");
    expect(within(navigation).queryByRole("link", { name: "Yêu thích" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trung tâm trợ giúp" })).toHaveAttribute("href", "/help");
  });

  it("uses compact top spacing for listing detail pages", () => {
    navigationMocks.pathname.mockReturnValue("/listings/243");
    render(<AppShell>Chi tiết tin đăng</AppShell>);

    expect(screen.getByRole("main")).toHaveClass("py-4", "sm:py-6");
    expect(screen.getByRole("main")).not.toHaveClass("sm:py-12");
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
    navigationMocks.pathname.mockReturnValue("/near-me");
    authenticate("TENANT");
    render(<AppShell>Nội dung trang</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng marketplace" });
    expect(within(navigation).getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(within(navigation).getByRole("link", { name: "Gần tôi" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Ở ghép" })).toHaveAttribute("href", "/roommates");
    expect(within(navigation).getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("href", "/inquiries");
    expect(within(navigation).queryByRole("link", { name: "Yêu thích" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Đã xem gần đây" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Tìm kiếm đã lưu" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Thông báo" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Thông báo" })).toHaveAttribute(
      "href",
      "/notifications"
    );
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "Đăng ký" })).not.toBeInTheDocument();
    expect(screen.getByText("tenant@example.com")).toBeInTheDocument();
  });

  it("provides a five-item tenant mobile navigation using existing routes", async () => {
    navigationMocks.pathname.mockReturnValue("/inquiries");
    authenticate("TENANT");
    render(<AppShell>Ná»™i dung trang</AppShell>);

    const mobileNavigation = await waitFor(() =>
      screen.getByRole("navigation", { name: "Điều hướng nhanh trên di động" })
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Trang chủ trên di động" })).toHaveAttribute("href", "/");
    expect(within(mobileNavigation).getByRole("link", { name: "Tìm phòng trên di động" })).toHaveAttribute(
      "href",
      "/search"
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Gần tôi trên di động" })).toHaveAttribute(
      "href",
      "/near-me"
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Ở ghép trên di động" })).toHaveAttribute(
      "href",
      "/roommates"
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Tin nhắn trên di động" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(mobileNavigation).queryByRole("link", { name: "Đã lưu trên di động" })).not.toBeInTheDocument();
    expect(within(mobileNavigation).queryByRole("link", { name: "Tài khoản trên di động" })).not.toBeInTheDocument();
  });

  it("does not cover a tenant conversation detail with the fixed mobile navigation", async () => {
    navigationMocks.pathname.mockReturnValue("/inquiries/42");
    authenticate("TENANT");
    render(<AppShell>Ná»™i dung há»™i thoáº¡i</AppShell>);

    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Điều hướng nhanh trên di động" })).not.toBeInTheDocument()
    );
  });

  it("prefers the display name and provides a keyboard-accessible role-aware account menu", async () => {
    authenticate("TENANT", "Nguyễn Văn An");
    render(<AppShell>Nội dung trang</AppShell>);
    const trigger = screen.getByRole("button", { name: /Nguyễn Văn An/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu", { name: "Tài khoản" });
    expect(within(menu).getByRole("menuitem", { name: "Hồ sơ của tôi" })).toHaveAttribute("href", "/profile");
    expect(within(menu).getByRole("menuitem", { name: "Thông báo" })).toHaveAttribute("href", "/notifications");
    expect(within(menu).getByRole("menuitem", { name: "Yêu thích" })).toHaveAttribute("href", "/favorites");
    expect(within(menu).getByRole("menuitem", { name: "Đã xem gần đây" })).toHaveAttribute("href", "/recently-viewed");
    expect(within(menu).getByRole("menuitem", { name: "Tìm kiếm đã lưu" })).toHaveAttribute("href", "/saved-searches");
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

  it("uses a focused auth header without marketplace navigation", () => {
    navigationMocks.pathname.mockReturnValue("/login");
    render(<AppShell>Biểu mẫu đăng nhập</AppShell>);

    const header = screen.getByRole("banner");
    expect(screen.getByRole("main")).toHaveTextContent("Biểu mẫu đăng nhập");
    expect(within(header).getByRole("link", { name: "RentMate — về trang chủ" })).toHaveAttribute("href", "/");
    expect(within(header).getByRole("link", { name: "Tạo tài khoản" })).toHaveAttribute("href", "/register");
    expect(within(header).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Mở menu điều hướng" })).not.toBeInTheDocument();
    expect(within(header).queryByText(/Tìm phòng|Gần tôi|Yêu thích|Tin nhắn|Thông báo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("keeps a single account switch action on mobile auth routes", () => {
    navigationMocks.pathname.mockReturnValue("/register/tenant");
    render(<AppShell>Biểu mẫu đăng ký</AppShell>);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(within(header).queryByRole("button", { name: "Mở menu điều hướng" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("navigation")).not.toBeInTheDocument();
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
    ["/admin", "Tổng quan", false],
    ["/admin/listings", "Kiểm duyệt tin", false],
    ["/admin/listings/42", "Kiểm duyệt tin", false],
    ["/admin/users", "Người dùng", false],
    ["/admin/verifications", "Xác minh chủ trọ", false],
    ["/admin/support-requests", "Yêu cầu hỗ trợ", false],
    ["/admin/reviews", "Đánh giá", false],
    ["/admin/reports", "Tin đăng", true],
    ["/admin/contact-reports", "Liên hệ", true],
    ["/admin/roommate-reports", "Ở ghép", true],
    ["/admin/review-reports", "Đánh giá", true]
  ])("renders the admin workspace and active item at %s", (pathname, activeLabel, isReport) => {
    navigationMocks.pathname.mockReturnValue(pathname);
    authenticate("ADMIN");
    render(<AppShell>Nội dung admin</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng khu vực quản trị" });
    const reportToggle = within(navigation).getByRole("button", { name: "Xử lý báo cáo" });
    expect(reportToggle).toHaveAttribute("aria-expanded", String(isReport));
    const activeSection = isReport ? within(navigation).getByRole("group", { name: "Loại báo cáo" }) : navigation;
    expect(within(activeSection).getByRole("link", { name: activeLabel })).toHaveAttribute("aria-current", "page");
    if (!isReport) expect(within(navigation).queryByRole("link", { name: "Tin đăng" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Yêu thích" })).not.toBeInTheDocument();
  });

  it("expands and collapses report links without hiding them from the mobile drawer", () => {
    navigationMocks.pathname.mockReturnValue("/admin");
    authenticate("ADMIN");
    render(<AppShell>Nội dung admin</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Điều hướng khu vực quản trị" });
    const toggle = within(sidebar).getByRole("button", { name: "Xử lý báo cáo" });
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(within(sidebar).queryByRole("link", { name: "Tin đăng" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const reports = within(sidebar).getByRole("group", { name: "Loại báo cáo" });
    expect(reports).toHaveAttribute("id", panelId);
    expect(within(reports).getAllByRole("link")).toHaveLength(4);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Mở điều hướng khu vực quản trị" }));
    const dialog = screen.getByRole("dialog", { name: "Khu vực quản trị" });
    const mobileNavigation = within(dialog).getByRole("navigation", {
      name: "Điều hướng khu vực quản trị trên di động"
    });
    fireEvent.click(within(mobileNavigation).getByRole("button", { name: "Xử lý báo cáo" }));
    expect(within(mobileNavigation).getByRole("link", { name: "Tin đăng" })).toHaveAttribute("href", "/admin/reports");
    expect(within(dialog).getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("opens the report group when navigation enters a report route", () => {
    navigationMocks.pathname.mockReturnValue("/admin");
    authenticate("ADMIN");
    const view = render(<AppShell>Nội dung admin</AppShell>);

    navigationMocks.pathname.mockReturnValue("/admin/review-reports");
    view.rerender(<AppShell>Nội dung admin</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng khu vực quản trị" });
    expect(within(navigation).getByRole("button", { name: "Xử lý báo cáo" })).toHaveAttribute("aria-expanded", "true");
    const reports = within(navigation).getByRole("group", { name: "Loại báo cáo" });
    expect(within(reports).getByRole("link", { name: "Đánh giá" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the admin account in the top bar without a duplicate sidebar profile", () => {
    navigationMocks.pathname.mockReturnValue("/admin");
    authenticate("ADMIN", "Admin RentMate");
    render(<AppShell>Nội dung admin</AppShell>);

    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).queryByText("admin@example.com")).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("button", { name: /Admin RentMate/ })).toBeInTheDocument();
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
    expect(within(dialog).getByRole("link", { name: "Tìm kiếm đã lưu" })).toHaveAttribute("href", "/saved-searches");
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

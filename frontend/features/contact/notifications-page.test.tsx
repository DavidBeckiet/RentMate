import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, Notification, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigationMocks = vi.hoisted(() => ({
  pathname: vi.fn(() => "/notifications"),
  searchParams: vi.fn(() => new URLSearchParams()),
  push: vi.fn(),
  replace: vi.fn()
}));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { contact: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({
  usePathname: navigationMocks.pathname,
  useSearchParams: navigationMocks.searchParams,
  useRouter: () => ({ push: navigationMocks.push, replace: navigationMocks.replace })
}));

import { NotificationsPage } from "./notifications-page";

const tenant: UserProfile = {
  id: 7,
  displayName: null,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const notification: Notification = {
  id: 42,
  eventType: "SAVED_SEARCH_MATCHED",
  inquiryId: null,
  listingId: 501,
  roommateRequestId: null,
  roommateInterestId: null,
  resourcePath: "/listings/501",
  isRead: false,
  createdAt: "2026-08-25T00:00:00.000Z"
};

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenant, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

function page(
  data: readonly Notification[],
  pagination: Partial<ApiPage<Notification>["pagination"]> = {}
): ApiPage<Notification> {
  return { data, pagination: { page: 1, pageSize: 20, hasNextPage: false, ...pagination } };
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(auth());
    apiMocks.listNotifications.mockReset();
    apiMocks.markNotificationRead.mockReset();
    apiMocks.markAllNotificationsRead.mockReset();
    navigationMocks.pathname.mockReturnValue("/notifications");
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    apiMocks.listNotifications.mockResolvedValue(page([notification]));
    apiMocks.markNotificationRead.mockResolvedValue(undefined);
    apiMocks.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it("renders saved-search matches and marks every unread notification as read", async () => {
    render(<NotificationsPage />);

    expect(await screen.findByText("Có tin đăng mới phù hợp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" })).toBeInTheDocument();
    expect(apiMocks.listNotifications).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, expect.any(AbortSignal));

    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }));

    await waitFor(() => expect(apiMocks.markAllNotificationsRead).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Đánh dấu tất cả đã đọc" })).not.toBeInTheDocument()
    );
  });

  it("does not load notifications for an anonymous visitor", () => {
    useAuthMock.mockReturnValue(auth({ status: "anonymous", user: null }));
    render(<NotificationsPage />);

    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(apiMocks.listNotifications).not.toHaveBeenCalled();
  });

  it("labels roommate notifications without including message or contact content and uses a frontend conversation route", async () => {
    apiMocks.listNotifications.mockResolvedValue(
      page([
        {
          ...notification,
          eventType: "ROOMMATE_MESSAGE_RECEIVED",
          roommateInterestId: 9,
          resourcePath: "/roommate-interests/9"
        }
      ])
    );
    render(<NotificationsPage />);
    expect(await screen.findByText("Tin nhắn ở ghép mới")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tin nhắn ở ghép mới/i })).toHaveAttribute(
      "href",
      "/roommates/conversations/9"
    );
  });

  it("marks one unread notification read optimistically before navigation", async () => {
    render(<NotificationsPage />);
    const item = await screen.findByRole("link", { name: /Có tin đăng mới phù hợp/i });

    fireEvent.click(item);

    expect(screen.getByText("Đã đọc")).toBeInTheDocument();
    expect(apiMocks.markNotificationRead).toHaveBeenCalledWith(42);
  });

  it("rolls back a failed optimistic read and shows feedback", async () => {
    apiMocks.markNotificationRead.mockRejectedValueOnce(new Error("read failed"));
    render(<NotificationsPage />);
    const item = await screen.findByRole("link", { name: /Có tin đăng mới phù hợp/i });

    fireEvent.click(item);

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể cập nhật trạng thái thông báo");
    expect(screen.getByText("Chưa đọc")).toBeInTheDocument();
  });

  it("keeps unread rows and shows feedback when mark-all fails", async () => {
    apiMocks.markAllNotificationsRead.mockRejectedValueOnce(new Error("mark all failed"));
    render(<NotificationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Đánh dấu tất cả đã đọc" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa thể đánh dấu tất cả thông báo");
    expect(screen.getByText("Chưa đọc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" })).toBeInTheDocument();
  });

  it("renders a compact pagination control for later pages", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams("page=2"));
    apiMocks.listNotifications.mockResolvedValue(page([notification], { page: 2, hasNextPage: false }));
    render(<NotificationsPage />);

    const pagination = await screen.findByRole("navigation", { name: "Phân trang thông báo" });
    expect(pagination).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trước/u })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Sau/u })).toBeDisabled();
  });

  it("shows the compact empty state when the current page has no notifications", async () => {
    apiMocks.listNotifications.mockResolvedValue(page([]));
    render(<NotificationsPage />);

    expect(await screen.findByText("Chưa có thông báo mới")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Phân trang thông báo" })).not.toBeInTheDocument();
  });
});

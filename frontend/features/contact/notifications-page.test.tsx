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

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { contact: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

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

function page(data: readonly Notification[]): ApiPage<Notification> {
  return { data, pagination: { page: 1, pageSize: 100, hasNextPage: false } };
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(auth());
    apiMocks.listNotifications.mockReset();
    apiMocks.markNotificationRead.mockReset();
    apiMocks.markAllNotificationsRead.mockReset();
    apiMocks.listNotifications.mockResolvedValue(page([notification]));
    apiMocks.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it("renders saved-search matches and marks every unread notification as read", async () => {
    render(<NotificationsPage />);

    expect(await screen.findByText("Có tin đăng mới phù hợp với bộ lọc đã lưu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" })).toBeInTheDocument();
    expect(apiMocks.listNotifications).toHaveBeenCalledWith({}, expect.any(AbortSignal));

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
    expect(await screen.findByText("Cuộc trò chuyện ở ghép có tin nhắn mới.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cuộc trò chuyện ở ghép có tin nhắn mới/i })).toHaveAttribute(
      "href",
      "/roommates/conversations/9"
    );
  });
});

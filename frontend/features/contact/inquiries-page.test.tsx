import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, Inquiry, InquiryMessage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listTenantInquiries: vi.fn(),
  listLandlordInquiries: vi.fn(),
  getInquiry: vi.fn(),
  sendMessage: vi.fn(),
  createInquiry: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const realtimeMock = vi.hoisted(() => ({ connect: vi.fn(), close: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { contact: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("../../lib/api/inquiry-realtime", () => ({
  connectInquiryRealtime: vi.fn(() => {
    realtimeMock.connect();
    return { close: realtimeMock.close };
  })
}));

import { InquiriesPage } from "./inquiries-page";

const updatedAt = "2026-09-04T16:14:00.000Z";
const tenant: AuthContextValue["user"] = {
  id: 20,
  displayName: null,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: updatedAt,
  updatedAt
};

const message: InquiryMessage = {
  id: 1,
  senderRole: "LANDLORD",
  body: "Phòng còn trống không ạ?",
  isRead: true,
  createdAt: updatedAt
};

const listingSummary: Inquiry["listingSummary"] = {
  id: 243,
  title: "Studio có ban công tại Bình Thạnh",
  propertyType: { code: "STUDIO", label: "Căn studio" },
  monthlyRent: 6500000,
  roomAreaSqm: 32,
  areaName: "Bình Thạnh",
  businessStatus: "AVAILABLE",
  coverImage: { url: "/studio.webp", altText: "Studio", displayOrder: 1 }
};

function inquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    id: 113,
    listingId: 243,
    status: "NEW",
    contactPhone: null,
    preferredContactAt: null,
    createdAt: updatedAt,
    updatedAt,
    canSendMessage: true,
    blockedByCurrentUser: false,
    messages: [message],
    listingSummary,
    listingContextState: "AVAILABLE",
    lastMessage: message,
    ...overrides
  };
}

function page(data: readonly Inquiry[], pageNumber = 1, hasNextPage = false): ApiPage<Inquiry> {
  return { data, pagination: { page: pageNumber, pageSize: 20, hasNextPage } };
}

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: tenant,
    error: null,
    refresh: vi.fn(),
    logout: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  apiMocks.listTenantInquiries.mockReset();
  apiMocks.listLandlordInquiries.mockReset();
  apiMocks.getInquiry.mockReset();
  apiMocks.sendMessage.mockReset();
  apiMocks.createInquiry.mockReset();
  realtimeMock.connect.mockReset();
  realtimeMock.close.mockReset();
  useAuthMock.mockReturnValue(authValue());
  apiMocks.listTenantInquiries.mockResolvedValue(page([]));
  apiMocks.getInquiry.mockResolvedValue(inquiry());
});

describe("Tenant conversation inbox", () => {
  it("uses the conversation header without inquiry counts or technical copy", async () => {
    render(<InquiriesPage />);

    expect(await screen.findByRole("heading", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(screen.getByText("Các cuộc trò chuyện của bạn với chủ trọ.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Yêu cầu của tôi" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ yêu cầu/)).not.toBeInTheDocument();
  });

  it("maps inquiry statuses to conversation language without unread semantics", async () => {
    apiMocks.listTenantInquiries.mockResolvedValue(
      page([
        inquiry({ id: 1, status: "NEW" }),
        inquiry({ id: 2, status: "CONTACTED" }),
        inquiry({ id: 3, status: "CLOSED" })
      ])
    );

    render(<InquiriesPage />);

    expect(await screen.findByText("Đã gửi")).toBeInTheDocument();
    expect(screen.getByText("Đang trao đổi")).toBeInTheDocument();
    expect(screen.getByText("Đã đóng")).toBeInTheDocument();
    expect(screen.queryByText("Mới")).not.toBeInTheDocument();
    expect(screen.queryByText(/chưa đọc|unread/i)).not.toBeInTheDocument();
  });

  it("shows the real last message with safe fallback metadata and opens the floating chat", async () => {
    apiMocks.listTenantInquiries.mockResolvedValue(page([inquiry()]));

    render(<InquiriesPage />);

    const row = await screen.findByRole("button", { name: /Studio có ban công tại Bình Thạnh/ });
    expect(row).toHaveAttribute("type", "button");
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Studio có ban công tại Bình Thạnh")).toBeInTheDocument();
    expect(screen.getByText("6.500.000 ₫/tháng · 32 m² · Bình Thạnh")).toBeInTheDocument();
    expect(screen.getByText("Chủ trọ: Phòng còn trống không ạ?")).toBeInTheDocument();
    expect(screen.getByText("Mở trò chuyện")).toBeInTheDocument();
    expect(screen.queryByText("Cuộc trò chuyện về tin đăng")).not.toBeInTheDocument();
    expect(screen.queryByText(/contactPhone|preferredContactAt|blockedByCurrentUser/i)).not.toBeInTheDocument();
    expect(apiMocks.listTenantInquiries).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, expect.any(AbortSignal));
  });

  it("labels the tenant's own latest message as Bạn", async () => {
    const ownMessage: InquiryMessage = { ...message, senderRole: "TENANT", body: "hello" };
    apiMocks.listTenantInquiries.mockResolvedValue(
      page([inquiry({ messages: [ownMessage], lastMessage: ownMessage })])
    );

    render(<InquiriesPage />);

    expect(await screen.findByText("Bạn: hello")).toBeInTheDocument();
  });

  it("keeps unavailable listings and empty conversations readable without technical IDs", async () => {
    apiMocks.listTenantInquiries.mockResolvedValue(
      page([
        inquiry({
          listingSummary: null,
          listingContextState: "UNAVAILABLE",
          messages: [],
          lastMessage: null
        })
      ])
    );

    render(<InquiriesPage />);

    expect(await screen.findByText("Tin đăng không còn khả dụng")).toBeInTheDocument();
    expect(screen.getByText("Chưa có nội dung trò chuyện.")).toBeInTheDocument();
    expect(screen.queryByText("Tin đăng #243")).not.toBeInTheDocument();
  });

  it("keeps the latest message preview when listing context is unavailable", async () => {
    const unavailableMessage: InquiryMessage = { ...message, body: "Mình vẫn muốn xem phòng." };
    apiMocks.listTenantInquiries.mockResolvedValue(
      page([
        inquiry({
          listingSummary: null,
          listingContextState: "TEMPORARILY_UNAVAILABLE",
          messages: [unavailableMessage],
          lastMessage: unavailableMessage
        })
      ])
    );

    render(<InquiriesPage />);

    expect(await screen.findByText("Thông tin tin đăng tạm thời chưa tải được")).toBeInTheDocument();
    expect(screen.getByText("Chủ trọ: Mình vẫn muốn xem phòng.")).toBeInTheDocument();
  });

  it("opens the known inquiry in the shared floating chat without changing the inbox route", async () => {
    apiMocks.listTenantInquiries.mockResolvedValue(page([inquiry()]));

    render(<InquiriesPage />);

    const row = await screen.findByRole("button", { name: /Studio có ban công tại Bình Thạnh/ });
    fireEvent.click(row);

    expect(await screen.findByRole("dialog", { name: "Nhắn tin với chủ trọ" })).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Phòng còn trống không ạ?")).toBeInTheDocument();
    expect(apiMocks.getInquiry).toHaveBeenCalledWith(113, expect.any(AbortSignal));
    expect(apiMocks.listTenantInquiries).toHaveBeenCalledTimes(1);
    expect(apiMocks.createInquiry).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  it("uses bounded API pagination instead of infinite append", async () => {
    apiMocks.listTenantInquiries.mockImplementation(({ page: requestedPage }: { page: number }) =>
      Promise.resolve(page([inquiry({ id: requestedPage })], requestedPage, requestedPage === 1))
    );

    render(<InquiriesPage />);
    expect(await screen.findByRole("button", { name: /Studio có ban công tại Bình Thạnh/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));

    await waitFor(() =>
      expect(apiMocks.listTenantInquiries).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }, expect.any(AbortSignal))
    );
    expect(screen.getByRole("button", { name: "Trước" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sau" })).toBeDisabled();
  });

  it("shows the tenant empty state and links back to search", async () => {
    render(<InquiriesPage />);

    expect(await screen.findByRole("heading", { name: "Bạn chưa có cuộc trò chuyện nào." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
  });

  it("uses compact conversation skeletons while the inbox is loading", async () => {
    apiMocks.listTenantInquiries.mockReturnValue(new Promise(() => undefined));

    render(<InquiriesPage />);

    expect(await screen.findByRole("status", { name: "Đang tải tin nhắn" })).toBeInTheDocument();
    expect(screen.queryByText("Đang kiểm tra tài khoản…")).not.toBeInTheDocument();
  });

  it("shows the tenant error copy and retries the existing list request", async () => {
    apiMocks.listTenantInquiries.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(page([inquiry()]));

    render(<InquiriesPage />);

    expect(await screen.findByText("Không thể tải tin nhắn lúc này.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByRole("button", { name: /Studio có ban công tại Bình Thạnh/ })).toBeInTheDocument();
    expect(apiMocks.listTenantInquiries).toHaveBeenCalledTimes(2);
  });
});

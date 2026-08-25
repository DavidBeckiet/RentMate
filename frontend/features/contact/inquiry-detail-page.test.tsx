import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { InquiryRealtimeEvent, InquiryRealtimeConnectionStatus } from "../../lib/api/inquiry-realtime";
import type { Inquiry, InquiryMessage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getInquiry: vi.fn(), sendMessage: vi.fn(), updateInquiryStatus: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const realtimeMock = vi.hoisted(() => ({
  handlers: null as null | {
    onEvent: (event: InquiryRealtimeEvent) => void;
    onStatusChange: (status: InquiryRealtimeConnectionStatus) => void;
  },
  close: vi.fn()
}));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { contact: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("../../lib/api/inquiry-realtime", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/inquiry-realtime")>(
    "../../lib/api/inquiry-realtime"
  );
  return {
    ...actual,
    connectInquiryRealtime: vi.fn((_id, handlers) => {
      realtimeMock.handlers = handlers;
      return { close: realtimeMock.close };
    })
  };
});
vi.mock("../reviews/tenant-review-panel", () => ({ TenantReviewPanel: () => null }));

import { InquiryDetailPage } from "./inquiry-detail-page";

const originalMessage: InquiryMessage = {
  id: 1,
  senderRole: "TENANT",
  body: "Mình muốn xem phòng.",
  isRead: true,
  createdAt: "2026-08-24T01:00:00.000Z"
};

const inquiry: Inquiry = {
  id: 7,
  listingId: 42,
  status: "NEW",
  contactPhone: "+84901234567",
  preferredContactAt: null,
  createdAt: originalMessage.createdAt,
  updatedAt: originalMessage.createdAt,
  canSendMessage: true,
  blockedByCurrentUser: false,
  messages: [originalMessage]
};

describe("InquiryDetailPage realtime", () => {
  beforeEach(() => {
    apiMocks.getInquiry.mockReset();
    apiMocks.sendMessage.mockReset();
    apiMocks.updateInquiryStatus.mockReset();
    realtimeMock.close.mockReset();
    realtimeMock.handlers = null;
    apiMocks.getInquiry.mockResolvedValue(inquiry);
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 20,
        displayName: null,
        role: "LANDLORD",
        email: "landlord@example.com",
        phone: "+84910000001",
        isActive: true,
        createdAt: originalMessage.createdAt,
        updatedAt: originalMessage.createdAt
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
  });

  it("shows connection feedback and appends an incoming message immediately", async () => {
    render(<InquiryDetailPage inquiryId="7" />);
    expect(await screen.findByText(originalMessage.body)).toBeInTheDocument();
    await waitFor(() => expect(realtimeMock.handlers).not.toBeNull());

    act(() => realtimeMock.handlers?.onStatusChange("connected"));
    expect(screen.getByRole("status")).toHaveTextContent("Đã kết nối trực tiếp");

    const incoming: InquiryMessage = {
      id: 2,
      senderRole: "TENANT",
      body: "Mình có thể xem lúc 18 giờ không?",
      isRead: false,
      createdAt: "2026-08-24T01:02:00.000Z"
    };
    act(() => realtimeMock.handlers?.onEvent({ type: "MESSAGE_CREATED", inquiryId: 7, message: incoming }));

    expect(screen.getByText(incoming.body)).toBeInTheDocument();
    expect(screen.getAllByText(incoming.body)).toHaveLength(1);
    await waitFor(() => expect(apiMocks.getInquiry).toHaveBeenCalledTimes(2));
  });

  it("deduplicates a sent message when the same realtime event arrives", async () => {
    const sent: InquiryMessage = {
      id: 2,
      senderRole: "LANDLORD",
      body: "Được, hẹn bạn lúc 18 giờ.",
      isRead: false,
      createdAt: "2026-08-24T01:03:00.000Z"
    };
    apiMocks.sendMessage.mockResolvedValue(sent);
    render(<InquiryDetailPage inquiryId="7" />);
    await screen.findByText(originalMessage.body);

    fireEvent.change(screen.getByLabelText("Tin nhắn mới"), { target: { value: sent.body } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByText(sent.body)).toBeInTheDocument();
    expect(apiMocks.sendMessage).toHaveBeenCalledWith(7, sent.body);

    act(() => realtimeMock.handlers?.onEvent({ type: "MESSAGE_CREATED", inquiryId: 7, message: sent }));
    expect(screen.getAllByText(sent.body)).toHaveLength(1);
  });

  it("applies a realtime closed status and disables further replies", async () => {
    render(<InquiryDetailPage inquiryId="7" />);
    await screen.findByText(originalMessage.body);

    act(() =>
      realtimeMock.handlers?.onEvent({
        type: "STATUS_CHANGED",
        inquiryId: 7,
        status: "CLOSED",
        updatedAt: "2026-08-24T01:04:00.000Z"
      })
    );

    expect(screen.getByText("Trạng thái: Đã đóng")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tin nhắn mới")).not.toBeInTheDocument();
  });
});

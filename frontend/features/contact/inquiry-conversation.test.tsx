import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Inquiry, InquiryMessage } from "../../types/api";
import { InquiryConversationCore, type InquiryConversationController } from "./inquiry-conversation";

const firstMessage: InquiryMessage = {
  id: 1,
  senderRole: "TENANT",
  body: "Mình muốn hỏi phòng còn trống.",
  isRead: true,
  createdAt: "2026-08-24T01:00:00.000Z"
};

const landlordMessage: InquiryMessage = {
  id: 2,
  senderRole: "LANDLORD",
  body: "Phòng vẫn còn bạn nhé.",
  isRead: false,
  createdAt: "2026-08-24T01:01:00.000Z"
};

const tenantMessage: InquiryMessage = {
  id: 3,
  senderRole: "TENANT",
  body: "Cảm ơn chủ trọ.",
  isRead: true,
  createdAt: "2026-08-24T01:02:00.000Z"
};

function inquiry(id: number, messages: readonly InquiryMessage[]): Inquiry {
  const lastMessage = messages[messages.length - 1] ?? null;
  return {
    id,
    listingId: 42,
    status: "CONTACTED",
    contactPhone: null,
    preferredContactAt: null,
    createdAt: firstMessage.createdAt,
    updatedAt: lastMessage?.createdAt ?? firstMessage.createdAt,
    canSendMessage: true,
    blockedByCurrentUser: false,
    messages,
    listingSummary: null,
    listingContextState: "AVAILABLE",
    lastMessage
  };
}

function controller(currentInquiry: Inquiry): InquiryConversationController {
  return {
    inquiry: currentInquiry,
    state: "success",
    error: null,
    realtimeStatus: "connected",
    draft: "",
    setDraft: vi.fn(),
    pending: false,
    send: vi.fn(async () => true),
    reload: vi.fn(),
    updateInquiry: vi.fn()
  };
}

function renderConversation(currentInquiry: Inquiry, variant: "floating" | "page" = "floating") {
  return render(
    <InquiryConversationCore conversation={controller(currentInquiry)} currentUserRole="TENANT" variant={variant} />
  );
}

function setScrollMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop = 0) {
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(element, "scrollTop", { configurable: true, writable: true, value: scrollTop });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InquiryConversationCore message history", () => {
  it("scrolls the initial conversation to the latest message without scrolling the page", () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 });
    const pageScrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    try {
      const { container } = renderConversation(inquiry(1, [firstMessage]));
      const messageList = container.querySelector('[aria-label="Tin nhắn trong cuộc trò chuyện"]') as HTMLElement;

      expect(messageList.scrollTop).toBe(600);
      expect(pageScrollSpy).not.toHaveBeenCalled();
    } finally {
      if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      else delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
      else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    }
  });

  it("shows a new-message indicator and preserves reading position when an incoming message arrives above the bottom", () => {
    const view = renderConversation(inquiry(1, [firstMessage]));
    const messageList = screen.getByLabelText("Tin nhắn trong cuộc trò chuyện");
    setScrollMetrics(messageList, 1000, 400, 0);
    fireEvent.scroll(messageList);

    view.rerender(
      <InquiryConversationCore
        conversation={controller(inquiry(1, [firstMessage, landlordMessage]))}
        currentUserRole="TENANT"
        variant="floating"
      />
    );

    expect(screen.getByRole("button", { name: "Tin nhắn mới ↓" })).toBeInTheDocument();
    expect(messageList.scrollTop).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Tin nhắn mới ↓" }));
    expect(messageList.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: "Tin nhắn mới ↓" })).not.toBeInTheDocument();
  });

  it("follows incoming messages when the user is near the bottom", () => {
    const view = renderConversation(inquiry(1, [firstMessage]));
    const messageList = screen.getByLabelText("Tin nhắn trong cuộc trò chuyện");
    setScrollMetrics(messageList, 1000, 400, 520);
    fireEvent.scroll(messageList);

    view.rerender(
      <InquiryConversationCore
        conversation={controller(inquiry(1, [firstMessage, landlordMessage]))}
        currentUserRole="TENANT"
        variant="floating"
      />
    );

    expect(messageList.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: "Tin nhắn mới ↓" })).not.toBeInTheDocument();
  });

  it("always follows a message sent by the current user", () => {
    const view = renderConversation(inquiry(1, [firstMessage]));
    const messageList = screen.getByLabelText("Tin nhắn trong cuộc trò chuyện");
    setScrollMetrics(messageList, 1000, 400, 0);
    fireEvent.scroll(messageList);

    view.rerender(
      <InquiryConversationCore
        conversation={controller(inquiry(1, [firstMessage, tenantMessage]))}
        currentUserRole="TENANT"
        variant="floating"
      />
    );

    expect(messageList.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: "Tin nhắn mới ↓" })).not.toBeInTheDocument();
  });

  it("resets scroll state when switching conversations", () => {
    const view = renderConversation(inquiry(1, [firstMessage]));
    const messageList = screen.getByLabelText("Tin nhắn trong cuộc trò chuyện");
    setScrollMetrics(messageList, 1000, 400, 0);
    fireEvent.scroll(messageList);
    view.rerender(
      <InquiryConversationCore
        conversation={controller(inquiry(1, [firstMessage, landlordMessage]))}
        currentUserRole="TENANT"
        variant="floating"
      />
    );
    expect(screen.getByRole("button", { name: "Tin nhắn mới ↓" })).toBeInTheDocument();

    view.rerender(
      <InquiryConversationCore
        conversation={controller(inquiry(2, [firstMessage]))}
        currentUserRole="TENANT"
        variant="floating"
      />
    );

    expect(screen.queryByRole("button", { name: "Tin nhắn mới ↓" })).not.toBeInTheDocument();
    expect(messageList.scrollTop).toBe(1000);
  });

  it("keeps the full-page composer accessible while hiding the visible label", () => {
    renderConversation(inquiry(1, [firstMessage]), "page");

    expect(screen.getByLabelText("Nhập tin nhắn")).toBeInTheDocument();
    expect(screen.queryByText("Tin nhắn", { selector: "label" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeInTheDocument();
  });
});

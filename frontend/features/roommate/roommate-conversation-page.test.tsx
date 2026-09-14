import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateInterest, roommateMessage, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({
  getInterest: vi.fn(),
  listMessages: vi.fn(),
  markMessagesRead: vi.fn(),
  sendMessage: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const realtimeMocks = vi.hoisted(() => ({
  snapshot: {
    userId: 1,
    unreadCount: 0,
    latestNotification: null as Record<string, unknown> | null,
    latestNotificationVersion: 0,
    realtimeStatus: "connected" as string
  }
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates/conversations/91" }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("../contact/notification-unread-store", () => ({
  useNotificationRealtime: () => realtimeMocks.snapshot
}));

import { RoommateConversationPage } from "./roommate-conversation-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

function messagePage(message = roommateMessage()) {
  return { data: [message], pagination: { page: 1, pageSize: 100, hasNextPage: false } };
}

describe("RoommateConversationPage", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    realtimeMocks.snapshot.latestNotification = null;
    realtimeMocks.snapshot.latestNotificationVersion = 0;
    realtimeMocks.snapshot.realtimeStatus = "connected";
    useAuthMock.mockReturnValue(auth());
    apiMocks.getInterest.mockResolvedValue(roommateInterest());
    apiMocks.listMessages.mockResolvedValue(messagePage());
    apiMocks.markMessagesRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    realtimeMocks.snapshot.latestNotification = null;
  });

  it("keeps the short safety warning visible, renders message text safely, and offers a non-blocking sensitive-content hint", async () => {
    apiMocks.listMessages.mockResolvedValue(messagePage(roommateMessage({ body: "<img src=x onerror=alert(1)>" })));
    render(<RoommateConversationPage interestId="91" />);

    expect(
      await screen.findByText(
        "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByLabelText("Tin nhắn của người còn lại")).toHaveTextContent("Người còn lại");
    expect(screen.getByText("Trao đổi qua RentMate trước.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tin nhắn (bắt buộc)"), { target: { value: "Mình sẽ không gửi OTP." } });
    expect(
      screen.getAllByText(
        "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc."
      ).length
    ).toBeGreaterThan(1);
  });

  it("treats a terminal interest thread as read-only", async () => {
    apiMocks.getInterest.mockResolvedValue(roommateInterest({ status: "LEFT" }));
    render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText("Cuộc trò chuyện chỉ đọc")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tin nhắn (bắt buộc)")).not.toBeInTheDocument();
    expect(apiMocks.markMessagesRead).toHaveBeenCalledWith(91);
  });

  it("renders the hidden-message placeholder as neutral Vietnamese copy", async () => {
    apiMocks.listMessages.mockResolvedValue(
      messagePage(roommateMessage({ body: "This message is no longer available." }))
    );
    render(<RoommateConversationPage interestId="91" />);

    expect(await screen.findByText("Tin nhắn này hiện không còn hiển thị.")).toBeInTheDocument();
  });

  it("shows curated recipient-only AI caution guidance and preserves the OTP safety copy", async () => {
    apiMocks.listMessages.mockResolvedValue(
      messagePage(
        roommateMessage({
          sender: "COUNTERPART",
          safetyWarning: {
            outcome: "CAUTION",
            signalCodes: ["OTP_REQUEST"],
            warningCode: "ROOMMATE_AI_CAUTION",
            analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
            analyzedAt: "2026-08-31T00:00:00.000Z"
          }
        })
      )
    );
    render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText("Không chia sẻ mã xác thực")).toBeInTheDocument();
    expect(
      screen.getByText("RentMate không bao giờ yêu cầu bạn gửi mã xác thực hoặc OTP cho người dùng khác qua chat.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Hãy thận trọng trong cuộc trò chuyện này")).not.toBeInTheDocument();
  });

  it("never renders a server-provided warning on the sender's own message", async () => {
    apiMocks.listMessages.mockResolvedValue(
      messagePage(
        roommateMessage({
          sender: "SELF",
          safetyWarning: {
            outcome: "HIGH_CAUTION",
            signalCodes: ["OTP_REQUEST"],
            warningCode: "ROOMMATE_AI_HIGH_CAUTION",
            analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
            analyzedAt: "2026-08-31T00:00:00.000Z"
          }
        })
      )
    );
    render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByLabelText("Tin nhắn của bạn")).toBeInTheDocument();
    expect(screen.queryByText("Không chia sẻ mã xác thực")).not.toBeInTheDocument();
    expect(screen.queryByText("Hãy thận trọng trong cuộc trò chuyện này")).not.toBeInTheDocument();
  });

  it("shows one conversation banner for one or more HIGH_CAUTION counterpart warnings", async () => {
    apiMocks.listMessages.mockResolvedValue({
      data: [1, 2].map((id) =>
        roommateMessage({
          id,
          safetyWarning: {
            outcome: "HIGH_CAUTION",
            signalCodes: ["OTP_REQUEST"],
            warningCode: "ROOMMATE_AI_HIGH_CAUTION",
            analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
            analyzedAt: "2026-08-31T00:00:00.000Z"
          }
        })
      ),
      pagination: { page: 1, pageSize: 100, hasNextPage: false }
    });
    render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText("Hãy thận trọng trong cuộc trò chuyện này")).toBeInTheDocument();
    expect(screen.getAllByText("Hãy thận trọng trong cuộc trò chuyện này")).toHaveLength(1);
  });

  it("sends plain text only after an explicit submit", async () => {
    const sentMessage = roommateMessage({ id: 302, sender: "SELF", body: "Mình muốn trao đổi thêm." });
    apiMocks.sendMessage.mockResolvedValue(sentMessage);
    apiMocks.listMessages
      .mockResolvedValueOnce(messagePage())
      .mockResolvedValueOnce(messagePage())
      .mockResolvedValueOnce({
        data: [roommateMessage(), sentMessage],
        pagination: { page: 1, pageSize: 100, hasNextPage: false }
      });
    const view = render(<RoommateConversationPage interestId="91" />);
    const input = await screen.findByLabelText("Tin nhắn (bắt buộc)");
    fireEvent.change(input, { target: { value: "Mình muốn trao đổi thêm." } });
    expect(screen.getByText(`${Array.from("Mình muốn trao đổi thêm.").length}/2000 ký tự`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await waitFor(() => expect(apiMocks.sendMessage).toHaveBeenCalledWith(91, "Mình muốn trao đổi thêm."));
    expect(await screen.findByText("Mình muốn trao đổi thêm.")).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = roommateMessageNotification(91);
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });

    await waitFor(() => expect(apiMocks.listMessages).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Mình muốn trao đổi thêm.")).toHaveLength(1);

    act(() => {
      realtimeMocks.snapshot.latestNotification = {
        ...roommateMessageNotification(91),
        createdAt: "2026-09-01T12:00:01.000Z"
      };
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });
    await waitFor(() => expect(apiMocks.listMessages).toHaveBeenCalledTimes(3));
    expect(screen.getAllByText("Mình muốn trao đổi thêm.")).toHaveLength(1);
  });

  it("lets tenants move through paginated message history", async () => {
    const firstPageMessage = roommateMessage({ id: 401, body: "First page message." });
    const secondPageMessage = roommateMessage({ id: 402, body: "Second page message." });
    apiMocks.listMessages
      .mockResolvedValueOnce({ data: [firstPageMessage], pagination: { page: 1, pageSize: 100, hasNextPage: true } })
      .mockResolvedValueOnce({ data: [secondPageMessage], pagination: { page: 2, pageSize: 100, hasNextPage: false } });

    render(<RoommateConversationPage interestId="91" />);

    expect(await screen.findByText(firstPageMessage.body)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Trang sau/iu }));

    await waitFor(() =>
      expect(apiMocks.listMessages).toHaveBeenLastCalledWith(91, { page: 2, pageSize: 100 }, expect.any(AbortSignal))
    );
    expect(await screen.findByText(secondPageMessage.body)).toBeInTheDocument();
  });

  it("refreshes the active conversation when a matching SSE notification arrives", async () => {
    const incoming = roommateMessage({ id: 502, body: "A new message arrived." });
    apiMocks.listMessages.mockResolvedValueOnce(messagePage()).mockResolvedValueOnce(messagePage(incoming));
    const view = render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = roommateMessageNotification(91);
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });

    expect(await screen.findByText("A new message arrived.")).toBeInTheDocument();
    expect(apiMocks.listMessages).toHaveBeenNthCalledWith(2, 91, { page: 1, pageSize: 100 }, expect.any(AbortSignal));
  });

  it("refreshes when a deduplicated notification row announces another message and merges by message id", async () => {
    const incoming = roommateMessage({ id: 506, body: "A later message arrived." });
    apiMocks.listMessages
      .mockResolvedValueOnce(messagePage())
      .mockResolvedValueOnce({
        data: [roommateMessage(), incoming],
        pagination: { page: 1, pageSize: 100, hasNextPage: false }
      })
      .mockResolvedValueOnce({
        data: [roommateMessage(), incoming],
        pagination: { page: 1, pageSize: 100, hasNextPage: false }
      });
    const view = render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = roommateMessageNotification(91);
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });
    expect(await screen.findByText(incoming.body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = {
        ...roommateMessageNotification(91),
        createdAt: "2026-09-01T12:00:01.000Z"
      };
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });

    await waitFor(() => expect(apiMocks.listMessages).toHaveBeenCalledTimes(3));
    expect(screen.getAllByText(incoming.body)).toHaveLength(1);
  });

  it("keeps two incoming messages with identical text because their stable ids differ", async () => {
    const first = roommateMessage({ id: 507, body: "Cùng một nội dung." });
    const second = roommateMessage({ id: 508, body: "Cùng một nội dung." });
    apiMocks.listMessages.mockResolvedValueOnce(messagePage()).mockResolvedValueOnce({
      data: [roommateMessage(), first, second],
      pagination: { page: 1, pageSize: 100, hasNextPage: false }
    });
    const view = render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = roommateMessageNotification(91);
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });

    await waitFor(() => expect(screen.getAllByText("Cùng một nội dung.")).toHaveLength(2));
  });

  it("keeps message reports and blocking in conversation safety instead of each bubble", async () => {
    render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();
    expect(screen.queryByLabelText("Tùy chọn tin nhắn")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Báo cáo tin nhắn" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "An toàn" }));
    const safetyDialog = await screen.findByRole("dialog", { name: "An toàn cuộc trò chuyện" });
    fireEvent.click(screen.getByRole("button", { name: "Báo cáo tin nhắn" }));

    expect(safetyDialog).not.toBeInTheDocument();
    expect(await screen.findByText("Chọn tin nhắn cần báo cáo.")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /Chọn tin nhắn của người còn lại/iu }), { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Báo cáo nội dung ở ghép" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Chọn tin nhắn của người còn lại/iu }), { key: " " });
    expect(await screen.findByRole("dialog", { name: "Báo cáo nội dung ở ghép" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    fireEvent.click(screen.getByRole("button", { name: "Hủy chọn tin nhắn" }));

    fireEvent.click(screen.getByRole("button", { name: "An toàn" }));
    const reopenedSafetyDialog = await screen.findByRole("dialog", { name: "An toàn cuộc trò chuyện" });
    fireEvent.click(within(reopenedSafetyDialog).getByRole("button", { name: "Chặn" }));
    expect(await screen.findByRole("dialog", { name: "Xác nhận chặn tương tác" })).toBeInTheDocument();
  });

  it("ignores realtime notifications for a different roommate conversation", async () => {
    const view = render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = roommateMessageNotification(92);
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });

    expect(apiMocks.listMessages).toHaveBeenCalledTimes(1);
  });

  it("syncs messages after SSE reconnect", async () => {
    realtimeMocks.snapshot.realtimeStatus = "connecting";
    const incoming = roommateMessage({ id: 503, body: "Message after reconnect." });
    apiMocks.listMessages.mockResolvedValueOnce(messagePage()).mockResolvedValueOnce(messagePage(incoming));
    const view = render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.realtimeStatus = "connected";
      view.rerender(<RoommateConversationPage interestId="91" />);
    });
    expect(await screen.findByText("Message after reconnect.")).toBeInTheDocument();
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(2);
  });

  it("aborts a pending refresh when the active conversation changes", async () => {
    let resolveRefresh: ((page: ReturnType<typeof messagePage>) => void) | null = null;
    let refreshSignal: AbortSignal | undefined;
    apiMocks.listMessages
      .mockResolvedValueOnce(messagePage())
      .mockImplementationOnce((_interestId, _query, signal) => {
        refreshSignal = signal;
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      })
      .mockResolvedValueOnce(messagePage(roommateMessage({ id: 504, body: "Conversation B." })));
    const view = render(<RoommateConversationPage interestId="91" />);
    expect(await screen.findByText(roommateMessage().body)).toBeInTheDocument();

    act(() => {
      realtimeMocks.snapshot.latestNotification = roommateMessageNotification(91);
      realtimeMocks.snapshot.latestNotificationVersion += 1;
      view.rerender(<RoommateConversationPage interestId="91" />);
    });
    await waitFor(() => expect(apiMocks.listMessages).toHaveBeenCalledTimes(2));
    expect(refreshSignal?.aborted).toBe(false);

    view.rerender(<RoommateConversationPage interestId="92" />);
    expect(await screen.findByText("Conversation B.")).toBeInTheDocument();
    expect(refreshSignal?.aborted).toBe(true);
    await act(async () => {
      resolveRefresh?.(messagePage(roommateMessage({ id: 505, body: "Stale conversation message." })));
    });
    expect(screen.queryByText("Stale conversation message.")).not.toBeInTheDocument();
  });
});

function roommateMessageNotification(interestId: number) {
  return {
    id: 501,
    eventType: "ROOMMATE_MESSAGE_RECEIVED",
    inquiryId: null,
    listingId: null,
    roommateRequestId: 42,
    roommateInterestId: interestId,
    resourcePath: `/roommates/messages?roommate=${interestId}`,
    isRead: false,
    createdAt: "2026-09-01T12:00:00.000Z"
  };
}

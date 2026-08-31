import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates/conversations/91" }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

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
    useAuthMock.mockReturnValue(auth());
    apiMocks.getInterest.mockResolvedValue(roommateInterest());
    apiMocks.listMessages.mockResolvedValue(messagePage());
    apiMocks.markMessagesRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
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
    apiMocks.sendMessage.mockResolvedValue(
      roommateMessage({ id: 302, sender: "SELF", body: "Mình muốn trao đổi thêm." })
    );
    render(<RoommateConversationPage interestId="91" />);
    const input = await screen.findByLabelText("Tin nhắn (bắt buộc)");
    fireEvent.change(input, { target: { value: "Mình muốn trao đổi thêm." } });
    expect(screen.getByText(`${Array.from("Mình muốn trao đổi thêm.").length}/2000 ký tự`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await waitFor(() => expect(apiMocks.sendMessage).toHaveBeenCalledWith(91, "Mình muốn trao đổi thêm."));
    expect(await screen.findByLabelText("Tin nhắn của bạn")).toHaveTextContent("Bạn");
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

  it("polls at five seconds and never exceeds the thirty-second window", async () => {
    vi.useFakeTimers();
    render(<RoommateConversationPage interestId="91" />);
    await flushMicrotasks();
    expect(screen.getByText(roommateMessage().body)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });

    expect(apiMocks.listMessages).toHaveBeenCalledTimes(6);
  });

  it("stops polling as soon as a recipient warning arrives", async () => {
    vi.useFakeTimers();
    const warning = roommateMessage({
      safetyWarning: {
        outcome: "HIGH_CAUTION",
        signalCodes: ["OTP_REQUEST"],
        warningCode: "ROOMMATE_AI_HIGH_CAUTION",
        analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
        analyzedAt: "2026-08-31T00:00:00.000Z"
      }
    });
    apiMocks.listMessages
      .mockResolvedValueOnce(messagePage())
      .mockResolvedValueOnce(messagePage())
      .mockResolvedValueOnce(messagePage(warning));
    render(<RoommateConversationPage interestId="91" />);
    await flushMicrotasks();
    expect(screen.getByText(roommateMessage().body)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(3);
  });

  it("does not overlap a pending poll request", async () => {
    vi.useFakeTimers();
    let resolvePoll: ((value: ReturnType<typeof messagePage>) => void) | null = null;
    apiMocks.listMessages.mockResolvedValueOnce(messagePage()).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        })
    );
    render(<RoommateConversationPage interestId="91" />);
    await flushMicrotasks();
    expect(screen.getByText(roommateMessage().body)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePoll?.(messagePage());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(3);
  });

  it("pauses polling while the document is hidden and resumes only while bounded", async () => {
    vi.useFakeTimers();
    render(<RoommateConversationPage interestId="91" />);
    await flushMicrotasks();
    expect(screen.getByText(roommateMessage().body)).toBeInTheDocument();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(2);
  });

  it("keeps the conversation usable after a polling failure", async () => {
    vi.useFakeTimers();
    apiMocks.listMessages.mockResolvedValueOnce(messagePage()).mockRejectedValueOnce(new Error("temporary network"));
    render(<RoommateConversationPage interestId="91" />);
    await flushMicrotasks();
    expect(screen.getByText(roommateMessage().body)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole("button", { name: /G.*tin/iu })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cleans up polling on unmount and ignores an old conversation response", async () => {
    vi.useFakeTimers();
    let resolvePoll: ((value: ReturnType<typeof messagePage>) => void) | null = null;
    apiMocks.listMessages
      .mockResolvedValueOnce(messagePage())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          })
      )
      .mockResolvedValueOnce(messagePage(roommateMessage({ body: "Conversation B." })));
    const view = render(<RoommateConversationPage interestId="91" />);
    await flushMicrotasks();
    expect(screen.getByText(roommateMessage().body)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    view.rerender(<RoommateConversationPage interestId="92" />);
    await flushMicrotasks();
    expect(screen.getByText("Conversation B.")).toBeInTheDocument();

    await act(async () => {
      resolvePoll?.(messagePage(warningMessage()));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(3);
  });
});

function warningMessage() {
  return roommateMessage({
    safetyWarning: {
      outcome: "HIGH_CAUTION",
      signalCodes: ["OTP_REQUEST"],
      warningCode: "ROOMMATE_AI_HIGH_CAUTION",
      analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
      analyzedAt: "2026-08-31T00:00:00.000Z"
    }
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

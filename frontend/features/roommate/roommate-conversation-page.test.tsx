import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});

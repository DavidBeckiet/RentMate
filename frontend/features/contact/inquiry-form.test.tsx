import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { Inquiry, InquiryMessage } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listTenantInquiries: vi.fn(),
  getInquiry: vi.fn(),
  createInquiry: vi.fn(),
  sendMessage: vi.fn(),
  blockInquiry: vi.fn(),
  unblockInquiry: vi.fn(),
  createContactReport: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const realtimeMock = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  handlers: null as null | { onEvent: (event: unknown) => void; onStatusChange: (status: unknown) => void }
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
    connectInquiryRealtime: vi.fn((_id: number, handlers: typeof realtimeMock.handlers) => {
      realtimeMock.handlers = handlers;
      realtimeMock.connect();
      return { close: realtimeMock.close };
    })
  };
});

import { InquiryForm } from "./inquiry-form";

const tenant: AuthContextValue["user"] = {
  id: 20,
  displayName: null,
  role: "TENANT",
  email: "tenant@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:00:00.000Z"
};

const message: InquiryMessage = {
  id: 1,
  senderRole: "TENANT",
  body: "Mình muốn hỏi phòng còn trống.",
  isRead: true,
  createdAt: "2026-08-24T01:00:00.000Z"
};

const listingSummary: Inquiry["listingSummary"] = {
  id: 42,
  title: "Studio trung tâm",
  propertyType: { code: "STUDIO", label: "Căn studio" },
  monthlyRent: 5200000,
  roomAreaSqm: 28,
  areaName: "Tân Bình",
  businessStatus: "AVAILABLE",
  coverImage: null
};

function inquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    id: 7,
    listingId: 42,
    status: "NEW",
    contactPhone: null,
    preferredContactAt: null,
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
    canSendMessage: true,
    blockedByCurrentUser: false,
    messages: [message],
    listingSummary,
    listingContextState: "AVAILABLE",
    lastMessage: message,
    ...overrides
  };
}

function page(data: readonly Inquiry[], hasNextPage = false) {
  return { data, pagination: { page: 1, pageSize: 100, hasNextPage } };
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
  apiMocks.getInquiry.mockReset();
  apiMocks.createInquiry.mockReset();
  apiMocks.sendMessage.mockReset();
  apiMocks.blockInquiry.mockReset();
  apiMocks.unblockInquiry.mockReset();
  apiMocks.createContactReport.mockReset();
  realtimeMock.connect.mockReset();
  realtimeMock.close.mockReset();
  realtimeMock.handlers = null;
  useAuthMock.mockReturnValue(authValue());
  apiMocks.listTenantInquiries.mockResolvedValue(page([]));
  apiMocks.getInquiry.mockResolvedValue(inquiry());
});

describe("InquiryForm floating chat widget", () => {
  it("keeps the guest on the existing login flow without inquiry lookup", () => {
    useAuthMock.mockReturnValue(authValue({ status: "anonymous", user: null }));
    render(<InquiryForm listingId={42} listingTitle="Studio trung tâm" />);

    expect(screen.getByRole("link", { name: "Đăng nhập để nhắn tin" })).toHaveAttribute("href", "/login");
    expect(apiMocks.listTenantInquiries).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the floating panel only after a tenant clicks and uses the largest page size", async () => {
    render(<InquiryForm listingId={42} listingTitle="Studio trung tâm" monthlyRent={5200000} areaName="Tân Bình" />);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    expect(await screen.findByRole("dialog", { name: "Nhắn tin với chủ trọ" })).toBeInTheDocument();
    expect(screen.getByTestId("floating-chat-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đóng nhắn tin nền" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(apiMocks.listTenantInquiries).toHaveBeenCalledWith({ page: 1, pageSize: 100 }, expect.any(AbortSignal))
    );

    expect(screen.getByRole("heading", { name: "Bắt đầu cuộc trò chuyện" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nội dung lời nhắn")).toBeInTheDocument();
    expect(screen.queryByLabelText("Số điện thoại liên hệ")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thời gian mong muốn được liên hệ (tùy chọn)")).not.toBeInTheDocument();
    expect(apiMocks.createInquiry).not.toHaveBeenCalled();
  });

  it("grows the new-message composer before enabling internal scrolling", async () => {
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    const messageField = await screen.findByLabelText("Nội dung lời nhắn");

    Object.defineProperty(messageField, "scrollHeight", { configurable: true, value: 96 });
    fireEvent.input(messageField);
    expect(messageField.style.height).toBe("96px");
    expect(messageField.style.overflowY).toBe("hidden");

    Object.defineProperty(messageField, "scrollHeight", { configurable: true, value: 180 });
    fireEvent.input(messageField);
    expect(messageField.style.height).toBe("144px");
    expect(messageField.style.overflowY).toBe("auto");
  });

  it("replaces the draft when a different quick question is selected", async () => {
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    const messageField = await screen.findByLabelText("Nội dung lời nhắn");
    const firstQuestion = screen.getByRole("button", { name: /Phòng này hiện tại còn trống/ });
    const secondQuestion = screen.getByRole("button", { name: /Chi phí dịch vụ/ });

    fireEvent.click(firstQuestion);
    expect(messageField).toHaveValue("Phòng này hiện tại còn trống không ạ?");
    expect(firstQuestion).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(secondQuestion);
    expect(messageField).toHaveValue("Chi phí dịch vụ, điện nước của phòng tính thế nào ạ?");
    expect(firstQuestion).toHaveAttribute("aria-pressed", "false");
    expect(secondQuestion).toHaveAttribute("aria-pressed", "true");
  });

  it("mounts the persistent launcher through document.body without scrolling or navigation", async () => {
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const initialPathname = window.location.pathname;
    render(<InquiryForm listingId={42} />);

    const portal = await screen.findByTestId("floating-chat-portal");
    expect(portal.parentElement).toBe(document.body);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    expect(await screen.findByRole("dialog", { name: "Nhắn tin với chủ trọ" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(initialPathname);
    expect(scrollToSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
  });

  it("continues lookup pagination until the current listing is found", async () => {
    const existing = inquiry({ id: 19, listingId: 42, status: "CONTACTED" });
    apiMocks.listTenantInquiries.mockImplementation(({ page: requestedPage }: { page: number }) =>
      Promise.resolve(requestedPage === 1 ? page([], true) : page([existing]))
    );
    apiMocks.getInquiry.mockResolvedValue(existing);
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    const replyTextarea = await screen.findByLabelText("Nhập tin nhắn");
    expect(replyTextarea).toHaveAttribute("rows", "1");
    expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeInTheDocument();

    expect(apiMocks.listTenantInquiries).toHaveBeenNthCalledWith(
      1,
      { page: 1, pageSize: 100 },
      expect.any(AbortSignal)
    );
    expect(apiMocks.listTenantInquiries).toHaveBeenNthCalledWith(
      2,
      { page: 2, pageSize: 100 },
      expect.any(AbortSignal)
    );
    expect(apiMocks.getInquiry).toHaveBeenCalledWith(19, expect.any(AbortSignal));
  });

  it("prioritizes an open inquiry over historical closed inquiries", async () => {
    const closed = inquiry({ id: 11, status: "CLOSED", updatedAt: "2026-08-25T01:00:00.000Z" });
    const open = inquiry({ id: 12, status: "NEW", updatedAt: "2026-08-20T01:00:00.000Z" });
    apiMocks.listTenantInquiries.mockResolvedValue(page([closed, open]));
    apiMocks.getInquiry.mockResolvedValue(open);
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    expect(await screen.findByText("Mình muốn hỏi phòng còn trống.")).toBeInTheDocument();
    expect(apiMocks.getInquiry).toHaveBeenCalledWith(12, expect.any(AbortSignal));
    expect(apiMocks.getInquiry).not.toHaveBeenCalledWith(11, expect.anything());
  });

  it("shows closed history read-only and starts a separate new inquiry mode", async () => {
    const closed = inquiry({ id: 15, status: "CLOSED" });
    apiMocks.listTenantInquiries.mockResolvedValue(page([closed]));
    apiMocks.getInquiry.mockResolvedValue(closed);
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    expect(await screen.findByText("Cuộc trò chuyện đã đóng, không thể gửi thêm tin nhắn.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nhập tin nhắn")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }));
    expect(await screen.findByRole("heading", { name: "Bắt đầu cuộc trò chuyện" })).toBeInTheDocument();
    expect(apiMocks.createInquiry).not.toHaveBeenCalled();
  });

  it("transitions the same widget from creation to the returned conversation", async () => {
    const created = inquiry({ id: 23, status: "NEW", messages: [{ ...message, id: 23, body: "Đã tạo yêu cầu." }] });
    apiMocks.createInquiry.mockResolvedValue(created);
    apiMocks.getInquiry.mockResolvedValue(created);
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    await screen.findByLabelText("Nội dung lời nhắn");
    fireEvent.change(screen.getByLabelText("Nội dung lời nhắn"), { target: { value: "Mình muốn xem phòng." } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    expect(await screen.findByText("Tin nhắn đã được gửi. Chủ trọ sẽ nhận được thông báo.")).toBeInTheDocument();
    expect(await screen.findByText("Đã tạo yêu cầu.")).toBeInTheDocument();
    expect(apiMocks.createInquiry).toHaveBeenCalledWith({
      listingId: 42,
      message: "Mình muốn xem phòng.",
      contactPhone: null,
      preferredContactAt: null
    });
    expect(apiMocks.getInquiry).toHaveBeenCalledWith(23, expect.any(AbortSignal));
    expect(apiMocks.createInquiry).toHaveBeenCalledTimes(1);
  });

  it("minimizes without disconnecting realtime and reopens the same conversation state", async () => {
    const existing = inquiry({ id: 31, status: "CONTACTED" });
    apiMocks.listTenantInquiries.mockResolvedValue(page([existing]));
    apiMocks.getInquiry.mockResolvedValue(existing);
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" }));
    await screen.findByText("Mình muốn hỏi phòng còn trống.");
    await waitFor(() => expect(realtimeMock.connect).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Thu gọn nhắn tin" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(realtimeMock.close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    await screen.findByText("Mình muốn hỏi phòng còn trống.");
    expect(realtimeMock.connect).toHaveBeenCalledTimes(1);
    expect(realtimeMock.close).not.toHaveBeenCalled();
  });

  it("lets the contact CTA and floating launcher control the same widget", async () => {
    render(<InquiryForm listingId={42} />);

    const contactCta = screen.getByRole("button", { name: "Nhắn tin cho chủ trọ" });
    fireEvent.click(contactCta);
    await screen.findByRole("dialog", { name: "Nhắn tin với chủ trọ" });
    expect(contactCta).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Thu gọn nhắn tin" }));
    expect(contactCta).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    expect(await screen.findByRole("dialog", { name: "Nhắn tin với chủ trọ" })).toBeInTheDocument();
    expect(apiMocks.listTenantInquiries).toHaveBeenCalledTimes(1);
  });

  it("preserves a new-inquiry draft when the widget is minimized", async () => {
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    const messageField = await screen.findByLabelText("Nội dung lời nhắn");
    fireEvent.change(messageField, { target: { value: "Mình muốn xem phòng vào cuối tuần." } });
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn nhắn tin" }));
    fireEvent.click(screen.getByTestId("floating-chat-launcher"));

    expect(await screen.findByLabelText("Nội dung lời nhắn")).toHaveValue("Mình muốn xem phòng vào cuối tuần.");
  });

  it("cleans up realtime when the widget is closed and starts one fresh connection later", async () => {
    const existing = inquiry({ id: 32, status: "CONTACTED" });
    apiMocks.listTenantInquiries.mockResolvedValue(page([existing]));
    apiMocks.getInquiry.mockResolvedValue(existing);
    render(<InquiryForm listingId={42} />);

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    await screen.findByText("Mình muốn hỏi phòng còn trống.");
    await waitFor(() => expect(realtimeMock.connect).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Đóng nhắn tin" }));
    await waitFor(() => expect(realtimeMock.close).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("floating-chat-launcher"));
    await screen.findByText("Mình muốn hỏi phòng còn trống.");
    await waitFor(() => expect(realtimeMock.connect).toHaveBeenCalledTimes(2));
    expect(realtimeMock.close).toHaveBeenCalledTimes(1);
  });

  it("opens a known inbox inquiry directly without rediscovering it or creating a new inquiry", async () => {
    const known = inquiry({
      id: 113,
      messages: [{ ...message, id: 113, body: "hello" }],
      lastMessage: { ...message, id: 113, body: "hello" }
    });
    apiMocks.getInquiry.mockResolvedValue(known);
    const onOpenChange = vi.fn();

    render(<InquiryForm inquiryId={113} open onOpenChange={onOpenChange} />);

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(apiMocks.getInquiry).toHaveBeenCalledWith(113, expect.any(AbortSignal));
    expect(apiMocks.listTenantInquiries).not.toHaveBeenCalled();
    expect(apiMocks.createInquiry).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Xem tin" })).toHaveAttribute("href", "/listings/42");
  });

  it("switches the same floating widget to another known inquiry and cleans up the previous realtime stream", async () => {
    const first = inquiry({ id: 113, messages: [{ ...message, id: 113, body: "first" }] });
    const second = inquiry({ id: 120, messages: [{ ...message, id: 120, body: "second" }] });
    apiMocks.getInquiry.mockImplementation((id: number) => Promise.resolve(id === 113 ? first : second));

    const { rerender } = render(<InquiryForm inquiryId={113} open />);
    expect(await screen.findByText("first")).toBeInTheDocument();
    await waitFor(() => expect(realtimeMock.connect).toHaveBeenCalledTimes(1));

    rerender(<InquiryForm inquiryId={120} open />);

    expect(await screen.findByText("second")).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.getInquiry).toHaveBeenCalledWith(120, expect.any(AbortSignal)));
    await waitFor(() => expect(realtimeMock.close).toHaveBeenCalled());
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    expect(apiMocks.listTenantInquiries).not.toHaveBeenCalled();
  });

  it("keeps a closed known inquiry read-only without offering a new inquiry flow", async () => {
    const closed = inquiry({ id: 113, status: "CLOSED" });
    apiMocks.getInquiry.mockResolvedValue(closed);

    render(<InquiryForm inquiryId={113} open />);

    expect(await screen.findByText("Cuộc trò chuyện đã đóng, không thể gửi thêm tin nhắn.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nhập tin nhắn")).not.toBeInTheDocument();
  });

  it("keeps block and report actions available inside the floating widget", async () => {
    apiMocks.getInquiry.mockResolvedValue(inquiry({ id: 113 }));
    apiMocks.blockInquiry.mockResolvedValue({ canSendMessage: false, blockedByCurrentUser: true });
    apiMocks.createContactReport.mockResolvedValue({
      id: 9,
      inquiryId: 113,
      category: "SPAM",
      status: "OPEN",
      createdAt: message.createdAt
    });

    render(<InquiryForm inquiryId={113} open />);
    await screen.findByText("Mình muốn hỏi phòng còn trống.");

    fireEvent.click(screen.getByRole("button", { name: "Thao tác an toàn" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Báo cáo cuộc trò chuyện" }));
    expect(screen.getByRole("form", { name: "Báo cáo cuộc trò chuyện" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gửi báo cáo" }));
    expect(await screen.findByText("Đã gửi báo cáo. RentMate sẽ xem xét thông tin này.")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Thao tác an toàn" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Chặn liên hệ" }));
    await waitFor(() => expect(apiMocks.blockInquiry).toHaveBeenCalledWith(113));
    vi.restoreAllMocks();
  });
});

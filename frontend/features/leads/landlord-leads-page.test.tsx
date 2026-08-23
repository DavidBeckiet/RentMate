import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { LandlordLead } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), saveNote: vi.fn(), saveReminder: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { leads: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { LandlordLeadsPage } from "./landlord-leads-page";

const lead: LandlordLead = {
  inquiryId: 7,
  listingId: 42,
  status: "NEW",
  contactPhone: "+84901234567",
  preferredContactAt: null,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:10:00.000Z",
  lastMessage: {
    senderRole: "TENANT",
    snippet: "Mình muốn xem phòng vào cuối tuần.",
    createdAt: "2026-08-23T00:10:00.000Z"
  },
  needsReply: true,
  hasUnreadTenantMessages: true,
  note: null,
  noteUpdatedAt: null,
  reminderAt: null,
  reminderUpdatedAt: null
};

function toDateTimeLocalValue(value: Date): string {
  const part = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}T${part(value.getHours())}:${part(value.getMinutes())}`;
}

describe("LandlordLeadsPage", () => {
  beforeEach(() => {
    apiMocks.list.mockReset();
    apiMocks.saveNote.mockReset();
    apiMocks.saveReminder.mockReset();
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 20,
        role: "LANDLORD",
        email: "landlord@example.com",
        phone: "+84910000001",
        isActive: true,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    apiMocks.list.mockResolvedValue({ data: [lead], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    apiMocks.saveNote.mockResolvedValue({ inquiryId: 7, note: "Gọi lại sau 18 giờ.", updatedAt: lead.updatedAt });
    apiMocks.saveReminder.mockImplementation(async (_inquiryId: number, remindAt: string | null) => ({
      inquiryId: 7,
      remindAt,
      updatedAt: remindAt === null ? null : lead.updatedAt
    }));
  });

  it("schedules a private follow-up reminder with explicit submission feedback", async () => {
    render(<LandlordLeadsPage />);
    await screen.findByText("Mình muốn xem phòng vào cuối tuần.");
    fireEvent.click(screen.getByRole("button", { name: "Thêm nhắc việc" }));
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000);
    const inputValue = toDateTimeLocalValue(future);
    fireEvent.change(screen.getByLabelText("Thời gian nhắc"), { target: { value: inputValue } });
    expect(screen.getByText(/không gửi push notification/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu nhắc việc" }));

    await waitFor(() => expect(apiMocks.saveReminder).toHaveBeenCalledWith(7, new Date(inputValue).toISOString()));
    expect(await screen.findByText("Đã lên lịch")).toBeInTheDocument();
  });

  it("loads the needs-reply work queue and saves a private note", async () => {
    render(<LandlordLeadsPage />);
    expect(await screen.findByText("Mình muốn xem phòng vào cuối tuần.")).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith({ view: "NEEDS_REPLY", page: 1, pageSize: 20 }, expect.any(AbortSignal));
    expect(screen.getByText("Chưa đọc")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+84901234567" })).toHaveAttribute("href", "tel:+84901234567");

    fireEvent.click(screen.getByRole("button", { name: "Thêm ghi chú" }));
    fireEvent.change(screen.getByLabelText("Ghi chú nội bộ"), { target: { value: "Gọi lại sau 18 giờ." } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));
    await waitFor(() => expect(apiMocks.saveNote).toHaveBeenCalledWith(7, "Gọi lại sau 18 giờ."));
    expect(await screen.findByText("Gọi lại sau 18 giờ.")).toBeInTheDocument();
  });

  it("changes to the closed queue without loading data for another role", async () => {
    render(<LandlordLeadsPage />);
    await screen.findByText("Mình muốn xem phòng vào cuối tuần.");
    fireEvent.click(screen.getByRole("button", { name: "Đã đóng" }));
    await waitFor(() =>
      expect(apiMocks.list).toHaveBeenCalledWith({ view: "CLOSED", page: 1, pageSize: 20 }, expect.any(AbortSignal))
    );

    fireEvent.click(screen.getByRole("button", { name: "Nhắc việc" }));
    await waitFor(() =>
      expect(apiMocks.list).toHaveBeenCalledWith({ view: "REMINDERS", page: 1, pageSize: 20 }, expect.any(AbortSignal))
    );

    apiMocks.list.mockClear();
    useAuthMock.mockReturnValue({ ...useAuthMock(), user: { ...useAuthMock().user!, role: "TENANT" } });
    render(<LandlordLeadsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho tài khoản chủ trọ");
    expect(apiMocks.list).not.toHaveBeenCalled();
  });
});

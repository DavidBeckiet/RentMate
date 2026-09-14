import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, Inquiry } from "../../types/api";
import { roommateInterest, tenantUser } from "../roommate/test-roommate-fixtures";
const mocks = vi.hoisted(() => ({
  tenant: vi.fn(),
  landlord: vi.fn(),
  interests: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
  auth: vi.fn<() => AuthContextValue>()
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/inquiries",
  useSearchParams: () => mocks.params
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: mocks.auth }));
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: {
    contact: { listTenantInquiries: mocks.tenant, listLandlordInquiries: mocks.landlord },
    roommates: { listInterests: mocks.interests }
  }
}));
vi.mock("../roommate/roommate-conversation-page", () => ({
  RoommateConversationPage: ({ interestId, onRead }: { interestId: string; onRead: () => void }) => (
    <button onClick={onRead}>Conversation {interestId}</button>
  )
}));
import { InquiriesPage } from "./inquiries-page";
import { rentalThread, roommateThread } from "./message-inbox";
const updatedAt = "2026-09-04T16:14:00.000Z";
function page<T>(data: readonly T[], hasNextPage = false): ApiPage<T> {
  return { data, pagination: { page: 1, pageSize: 100, hasNextPage } };
}
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
    messages: [],
    lastMessage: { id: 1, senderRole: "LANDLORD", body: "Phòng vẫn còn nhé", isRead: false, createdAt: updatedAt },
    listingSummary: {
      id: 243,
      title: "Studio Bình Thạnh",
      propertyType: { code: "STUDIO", label: "Studio" },
      monthlyRent: 6500000,
      roomAreaSqm: 32,
      areaName: "Bình Thạnh",
      businessStatus: "AVAILABLE",
      coverImage: null
    },
    listingContextState: "AVAILABLE",
    unreadCount: 2,
    ...overrides
  };
}
beforeEach(() => {
  mocks.params = new URLSearchParams();
  mocks.auth.mockReturnValue({
    status: "authenticated",
    user: tenantUser,
    error: null,
    refresh: vi.fn(),
    logout: vi.fn()
  });
  mocks.tenant.mockResolvedValue(page([inquiry()]));
  mocks.landlord.mockResolvedValue(page([]));
  mocks.interests.mockImplementation(({ direction }: { direction: string }) =>
    Promise.resolve(page(direction === "OUTGOING" ? [roommateInterest({ unreadCount: 0 })] : []))
  );
});
describe("Unified message inbox", () => {
  it("combines rental and roommate threads with actual unread counts", async () => {
    render(<InquiriesPage />);
    expect(await screen.findByText("Studio Bình Thạnh")).toBeInTheDocument();
    expect(await screen.findByText("Minh")).toBeInTheDocument();
    expect(screen.getByText("Phòng vẫn còn nhé")).toBeInTheDocument();
    expect(screen.getByLabelText("2 tin chưa đọc")).toBeInTheDocument();
  });
  it("filters categories, unread and accent-insensitive search", async () => {
    render(<InquiriesPage />);
    await screen.findByText("Minh");
    fireEvent.click(screen.getByRole("button", { name: "Ở ghép" }));
    expect(screen.queryByText("Studio Bình Thạnh")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Chưa đọc" }));
    expect(screen.queryByText("Minh")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "binh thanh" } });
    expect(screen.getByText("Studio Bình Thạnh")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "not found" } });
    expect(screen.getByText("Không có cuộc trò chuyện phù hợp với bộ lọc.")).toBeInTheDocument();
  });
  it("opens an existing roommate conversation in the main inbox", async () => {
    render(<InquiriesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Minh/ }));
    expect(mocks.push).toHaveBeenCalledWith("/inquiries?roommate=91", { scroll: false });
  });
  it("clears unread after reading is confirmed", async () => {
    mocks.params = new URLSearchParams("roommate=91");
    mocks.interests.mockResolvedValue(page([roommateInterest({ unreadCount: 3 })]));
    render(<InquiriesPage />);
    expect(await screen.findByLabelText("3 tin chưa đọc")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Conversation 91"));
    expect(screen.queryByLabelText("3 tin chưa đọc")).not.toBeInTheDocument();
  });
  it("preserves successful sources on partial failure and retries", async () => {
    mocks.tenant.mockRejectedValueOnce(new Error("network"));
    render(<InquiriesPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Thuê phòng");
    expect(screen.getByText("Minh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Studio Bình Thạnh")).toBeInTheDocument();
  });
  it("collects API pages but shows twenty threads per screen", async () => {
    mocks.interests.mockResolvedValue(page([]));
    mocks.tenant.mockImplementation(({ page: n }: { page: number }) =>
      Promise.resolve(
        page(
          Array.from({ length: n === 1 ? 20 : 1 }, (_, i) => inquiry({ id: n * 100 + i })),
          n === 1
        )
      )
    );
    render(<InquiriesPage />);
    await waitFor(() => expect(mocks.tenant).toHaveBeenCalledWith({ page: 2, pageSize: 100 }, expect.any(AbortSignal)));
    expect(screen.getAllByText("Studio Bình Thạnh")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(screen.getAllByText("Studio Bình Thạnh")).toHaveLength(1);
  });
  it("does not load tenant data for a landlord", async () => {
    mocks.auth.mockReturnValue({
      status: "authenticated",
      user: { ...tenantUser, role: "LANDLORD" },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    render(<InquiriesPage landlord />);
    await screen.findByText("Bạn chưa có cuộc trò chuyện nào.");
    expect(mocks.landlord).toHaveBeenCalled();
    expect(mocks.tenant).not.toHaveBeenCalled();
    expect(mocks.interests).not.toHaveBeenCalled();
  });
  it("does not load protected data for visitors", () => {
    mocks.auth.mockReturnValue({
      status: "anonymous",
      user: null,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    render(<InquiriesPage />);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(mocks.tenant).not.toHaveBeenCalled();
    expect(mocks.interests).not.toHaveBeenCalled();
  });
  it("uses safe unavailable fallbacks and never treats NEW status as unread", () => {
    expect(rentalThread(inquiry({ listingSummary: null, unreadCount: 0, status: "NEW" }), false)).toMatchObject({
      title: "Tin đăng không còn khả dụng",
      preview: "Phòng vẫn còn nhé",
      unread: 0
    });
    expect(
      roommateThread(
        roommateInterest({
          lastMessage: {
            id: 9,
            body: "This message is no longer available.",
            createdAt: updatedAt,
            isRead: false,
            sender: "COUNTERPART"
          }
        })
      ).preview
    ).toBe("Tin nhắn này hiện không còn hiển thị.");
  });
});

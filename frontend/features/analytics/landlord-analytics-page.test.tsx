import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { LandlordAnalytics, OwnerListingSummary, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getLandlord: vi.fn(), listOwned: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      analytics: { getLandlord: apiMocks.getLandlord },
      listings: { listOwned: apiMocks.listOwned }
    }
  };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { LandlordAnalyticsPage } from "./landlord-analytics-page";

const landlord: UserProfile = {
  id: 19,
  displayName: null,
  role: "LANDLORD",
  email: "landlord@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};
const refresh = vi.fn<() => Promise<void>>();
const analytics: LandlordAnalytics = {
  period: "30D",
  sinceAt: "2026-07-26T00:00:00.000Z",
  measuredAt: "2026-08-24T10:00:00.000Z",
  inquiries: 6,
  uniqueTenants: 4,
  respondedInquiries: 3,
  respondedWithin24Hours: 2,
  responseRate: 50,
  responseWithin24HoursRate: 33.3,
  averageFirstResponseMinutes: 75,
  closedInquiries: 1,
  needsReplyNow: 2,
  views: 12,
  favorites: 4,
  callClicks: 3,
  emailClicks: 2,
  previousPeriod: {
    sinceAt: "2026-06-26T00:00:00.000Z",
    untilAt: "2026-07-26T00:00:00.000Z",
    inquiries: 3,
    views: 10,
    favorites: 2,
    callClicks: 1,
    emailClicks: 1
  },
  daily: [
    { date: "2026-08-23", inquiries: 2, firstResponses: 1 },
    { date: "2026-08-24", inquiries: 4, firstResponses: 2 }
  ],
  topListings: [
    { listingId: 42, inquiries: 4, views: 8, favorites: 2, callClicks: 1, emailClicks: 1 },
    { listingId: 17, inquiries: 2, views: 4, favorites: 2, callClicks: 2, emailClicks: 1 }
  ]
};

const ownerListing: OwnerListingSummary = {
  id: 42,
  status: "APPROVED",
  businessStatus: "AVAILABLE",
  title: "Studio Bình Thạnh",
  monthlyRent: 6_500_000,
  maxOccupants: 2,
  areaName: "Bình Thạnh",
  availabilityStatus: "CURRENT",
  availabilityConfirmedAt: "2026-08-20T00:00:00.000Z",
  availabilityExpiresAt: "2026-09-20T00:00:00.000Z",
  propertyType: { code: "STUDIO", label: "Studio" },
  coverImage: null,
  currentModerationReason: null,
  updatedAt: "2026-08-20T00:00:00.000Z"
};

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: landlord,
    error: null,
    refresh,
    logout: vi.fn(),
    ...overrides
  };
}

describe("LandlordAnalyticsPage", () => {
  beforeEach(() => {
    apiMocks.getLandlord.mockReset();
    apiMocks.listOwned.mockReset();
    apiMocks.getLandlord.mockResolvedValue(analytics);
    apiMocks.listOwned.mockResolvedValue({
      data: [ownerListing],
      pagination: { page: 1, pageSize: 100, hasNextPage: false }
    });
    useAuthMock.mockReturnValue(auth());
    refresh.mockReset();
  });

  it("loads the 30-day contact metrics with an accessible chart data alternative", async () => {
    render(<LandlordAnalyticsPage />);

    expect(await screen.findByRole("heading", { name: "Phân tích hoạt động cho thuê" })).toBeInTheDocument();
    expect(apiMocks.getLandlord).toHaveBeenCalledWith("30D", expect.any(AbortSignal));
    expect(screen.getByText("Lượt xem tin")).toBeInTheDocument();
    expect(screen.getAllByText("Yêu cầu mới").length).toBeGreaterThan(0);
    expect(screen.getByText("1 giờ 15 phút")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Yêu cầu mới và phản hồi đầu tiên theo ngày/i })).toBeInTheDocument();
    expect(screen.getByText("Xem bảng dữ liệu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xử lý ngay/i })).toHaveAttribute("href", "/landlord/leads");
    expect(await screen.findByText("Studio Bình Thạnh")).toBeInTheDocument();
    expect(screen.getByText("+20% so với kỳ trước")).toBeInTheDocument();
    expect(screen.getByText("1 gọi · 1 email")).toBeInTheDocument();
    expect(screen.queryByText("Tỷ lệ phản hồi")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Từ lượt xem đến yêu cầu thuê" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Phản hồi đúng lúc" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bạn nên làm gì tiếp theo?" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/\binquiry\b|\blead\b|\banalytics\b/i);
  });

  it("reloads the dashboard when the landlord selects a different period", async () => {
    apiMocks.getLandlord
      .mockResolvedValueOnce(analytics)
      .mockResolvedValueOnce({ ...analytics, period: "7D", inquiries: 2 });
    render(<LandlordAnalyticsPage />);

    await screen.findByRole("heading", { name: "Phân tích hoạt động cho thuê" });
    fireEvent.click(screen.getByRole("button", { name: "7 ngày" }));

    await waitFor(() => expect(apiMocks.getLandlord).toHaveBeenLastCalledWith("7D", expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "7 ngày" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders safely while an older backend response has no previous-period comparison", async () => {
    apiMocks.getLandlord.mockResolvedValue({ ...analytics, previousPeriod: undefined } as unknown as LandlordAnalytics);
    render(<LandlordAnalyticsPage />);

    expect(await screen.findByRole("heading", { name: "Phân tích hoạt động cho thuê" })).toBeInTheDocument();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.queryByText(/so với kỳ trước/)).not.toBeInTheDocument();
  });

  it("blocks non-landlords before requesting private analytics", () => {
    useAuthMock.mockReturnValue(auth({ user: { ...landlord, role: "TENANT" } }));
    render(<LandlordAnalyticsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Trang này dành cho tài khoản chủ trọ.");
    expect(apiMocks.getLandlord).not.toHaveBeenCalled();
  });
});

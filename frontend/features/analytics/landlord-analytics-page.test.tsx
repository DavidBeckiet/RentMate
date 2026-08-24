import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { LandlordAnalytics, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getLandlord: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { analytics: apiMocks } };
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
  daily: [
    { date: "2026-08-23", inquiries: 2, firstResponses: 1 },
    { date: "2026-08-24", inquiries: 4, firstResponses: 2 }
  ],
  topListings: [
    { listingId: 42, inquiries: 4 },
    { listingId: 17, inquiries: 2 }
  ]
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
    apiMocks.getLandlord.mockResolvedValue(analytics);
    useAuthMock.mockReturnValue(auth());
    refresh.mockReset();
  });

  it("loads the 30-day inquiry metrics with an accessible chart data alternative", async () => {
    render(<LandlordAnalyticsPage />);

    expect(await screen.findByRole("heading", { name: "Thống kê inquiry" })).toBeInTheDocument();
    expect(apiMocks.getLandlord).toHaveBeenCalledWith("30D", expect.any(AbortSignal));
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("1 giờ 15 phút")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Inquiry mới và phản hồi đầu tiên theo ngày/i })).toBeInTheDocument();
    expect(screen.getByText("Xem bảng dữ liệu biểu đồ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mở hàng đợi lead/i })).toHaveAttribute("href", "/landlord/leads");
    expect(screen.getByText("Tin #42")).toBeInTheDocument();
  });

  it("reloads the dashboard when the landlord selects a different period", async () => {
    apiMocks.getLandlord
      .mockResolvedValueOnce(analytics)
      .mockResolvedValueOnce({ ...analytics, period: "7D", inquiries: 2 });
    render(<LandlordAnalyticsPage />);

    await screen.findByText("50%");
    fireEvent.click(screen.getByRole("button", { name: "7 ngày" }));

    await waitFor(() => expect(apiMocks.getLandlord).toHaveBeenLastCalledWith("7D", expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "7 ngày" })).toHaveAttribute("aria-pressed", "true");
  });

  it("blocks non-landlords before requesting private analytics", () => {
    useAuthMock.mockReturnValue(auth({ user: { ...landlord, role: "TENANT" } }));
    render(<LandlordAnalyticsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Trang này dành cho tài khoản chủ trọ.");
    expect(apiMocks.getLandlord).not.toHaveBeenCalled();
  });
});

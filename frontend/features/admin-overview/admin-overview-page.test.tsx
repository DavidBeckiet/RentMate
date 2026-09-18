import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type {
  AdminEngagementOverview,
  AdminIdentityOverview,
  AdminListingOverview,
  UserProfile
} from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  getIdentityOverview: vi.fn(),
  getListingOverview: vi.fn(),
  getEngagementOverview: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: apiMocks }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { AdminOverviewPage } from "./admin-overview-page";

const refresh = vi.fn<() => Promise<void>>();
const admin: UserProfile = {
  id: 1,
  displayName: "Admin RentMate",
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};
const identity: AdminIdentityOverview = {
  accounts: { total: 1284, byRole: { TENANT: 1035, LANDLORD: 243, ADMIN: 6 }, active: 1250, inactive: 34 },
  verifications: { pending: 7 },
  capturedAt: "2026-09-17T00:00:00.000Z"
};
const listings: AdminListingOverview = {
  listings: {
    total: 486,
    byStatus: { DRAFT: 11, PENDING: 12, APPROVED: 400, REJECTED: 20, HIDDEN: 25, INACTIVE: 18 }
  },
  listingReports: { open: 4, investigating: 2 },
  capturedAt: "2026-09-17T00:00:00.000Z"
};
const engagement: AdminEngagementOverview = {
  support: { open: 8, inProgress: 3 },
  reviews: { pending: 6 },
  contactReports: { open: 1, investigating: 2 },
  roommateReports: { open: 3, investigating: 4 },
  reviewReports: { open: 5, investigating: 6 },
  capturedAt: "2026-09-17T00:00:00.000Z"
};

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: admin, error: null, refresh, logout: vi.fn(), ...overrides };
}

function resolveAll(
  identityResponse: AdminIdentityOverview = identity,
  listingResponse: AdminListingOverview = listings,
  engagementResponse: AdminEngagementOverview = engagement
) {
  apiMocks.getIdentityOverview.mockResolvedValue(identityResponse);
  apiMocks.getListingOverview.mockResolvedValue(listingResponse);
  apiMocks.getEngagementOverview.mockResolvedValue(engagementResponse);
}

describe("AdminOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(auth());
  });

  it("loads the three authoritative overview sources and separates every operational state", async () => {
    resolveAll();
    render(<AdminOverviewPage />);

    expect(await screen.findByRole("heading", { name: "Tổng quan quản trị" })).toBeInTheDocument();
    expect(apiMocks.getIdentityOverview).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(apiMocks.getListingOverview).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(apiMocks.getEngagementOverview).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "tin chờ duyệt: 12" })).toHaveAttribute("href", "/admin/listings");
    expect(screen.getByRole("link", { name: "Yêu cầu hỗ trợ mới: 8" })).toHaveAttribute(
      "href",
      "/admin/support-requests"
    );
    expect(screen.getByRole("link", { name: "Yêu cầu hỗ trợ đang xem xét: 3" })).toHaveAttribute(
      "href",
      "/admin/support-requests?status=IN_PROGRESS"
    );
    expect(screen.getByRole("link", { name: "Báo cáo tin đăng mới: 4" })).toHaveAttribute("href", "/admin/reports");
    expect(screen.getByRole("link", { name: "Báo cáo tin đăng đang xem xét: 2" })).toHaveAttribute(
      "href",
      "/admin/reports?status=INVESTIGATING"
    );
    expect(screen.getByRole("link", { name: "Báo cáo liên hệ đang xem xét: 2" })).toHaveAttribute(
      "href",
      "/admin/contact-reports?status=INVESTIGATING"
    );
    expect(screen.getByRole("link", { name: "Báo cáo ở ghép đang xem xét: 4" })).toHaveAttribute(
      "href",
      "/admin/roommate-reports?status=INVESTIGATING"
    );
    expect(screen.getByRole("link", { name: "Báo cáo đánh giá đang xem xét: 6" })).toHaveAttribute(
      "href",
      "/admin/review-reports?status=INVESTIGATING"
    );
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/admin/verifications",
        "/admin/listings",
        "/admin/support-requests",
        "/admin/support-requests?status=IN_PROGRESS",
        "/admin/reviews",
        "/admin/reports",
        "/admin/reports?status=INVESTIGATING",
        "/admin/contact-reports",
        "/admin/contact-reports?status=INVESTIGATING",
        "/admin/roommate-reports",
        "/admin/roommate-reports?status=INVESTIGATING",
        "/admin/review-reports",
        "/admin/review-reports?status=INVESTIGATING"
      ])
    );
    expect(screen.getByText("1.284")).toBeInTheDocument();
    expect(screen.getByText("Đã duyệt kiểm duyệt")).toBeInTheDocument();
    expect(screen.queryByText(/đang công khai|đang hiển thị/i)).not.toBeInTheDocument();
  });

  it("shows the all-clear message only after every successful source reports zero operational work", async () => {
    const zeroIdentity = { ...identity, verifications: { pending: 0 } };
    const zeroListings = {
      ...listings,
      listings: { ...listings.listings, byStatus: { ...listings.listings.byStatus, PENDING: 0 } },
      listingReports: { open: 0, investigating: 0 }
    };
    const zeroEngagement: AdminEngagementOverview = {
      support: { open: 0, inProgress: 0 },
      reviews: { pending: 0 },
      contactReports: { open: 0, investigating: 0 },
      roommateReports: { open: 0, investigating: 0 },
      reviewReports: { open: 0, investigating: 0 },
      capturedAt: engagement.capturedAt
    };
    resolveAll(zeroIdentity, zeroListings, zeroEngagement);
    render(<AdminOverviewPage />);
    expect(await screen.findByText("Hiện không có việc đang chờ xử lý.")).toBeInTheDocument();
  });

  it("keeps successful sources and workflow links usable when listings data fails, then retries only listings", async () => {
    apiMocks.getIdentityOverview.mockResolvedValue(identity);
    apiMocks.getListingOverview.mockRejectedValueOnce(new Error("listing unavailable")).mockResolvedValueOnce(listings);
    apiMocks.getEngagementOverview.mockResolvedValue(engagement);
    render(<AdminOverviewPage />);

    expect(await screen.findAllByText("Chưa tải được")).not.toHaveLength(0);
    expect(screen.getByText("1.284")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "tin chờ duyệt" })).toHaveAttribute("href", "/admin/listings");
    expect(screen.queryByText("Hiện không có việc đang chờ xử lý.")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Thử lại" })[0]);
    await waitFor(() => expect(apiMocks.getListingOverview).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("link", { name: "tin chờ duyệt: 12" })).toBeInTheDocument();
  });

  it("keeps navigation usable without rendering false zero counts when every source fails", async () => {
    apiMocks.getIdentityOverview.mockRejectedValue(new Error("identity unavailable"));
    apiMocks.getListingOverview.mockRejectedValue(new Error("listing unavailable"));
    apiMocks.getEngagementOverview.mockRejectedValue(new Error("engagement unavailable"));
    render(<AdminOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa tải được số liệu tổng quan");
    expect(screen.getByRole("link", { name: "tin chờ duyệt" })).toHaveAttribute("href", "/admin/listings");
    expect(screen.queryByText("Hiện không có việc đang chờ xử lý.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "tin chờ duyệt: 0" })).not.toBeInTheDocument();
  });

  it("reloads all three sources through the manual refresh control", async () => {
    resolveAll();
    render(<AdminOverviewPage />);
    await screen.findByRole("heading", { name: "Tổng quan quản trị" });
    fireEvent.click(screen.getByRole("button", { name: "Làm mới số liệu" }));
    await waitFor(() => {
      expect(apiMocks.getIdentityOverview).toHaveBeenCalledTimes(2);
      expect(apiMocks.getListingOverview).toHaveBeenCalledTimes(2);
      expect(apiMocks.getEngagementOverview).toHaveBeenCalledTimes(2);
    });
  });
});

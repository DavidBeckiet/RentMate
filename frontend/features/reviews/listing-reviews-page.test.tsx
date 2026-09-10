import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { PublicListingDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  getPublicDetail: vi.fn(),
  listReviews: vi.fn(),
  listTenantInquiries: vi.fn(),
  getReviewEligibility: vi.fn(),
  createReview: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      listings: {
        getPublicDetail: apiMocks.getPublicDetail,
        listReviews: apiMocks.listReviews
      },
      contact: {
        listTenantInquiries: apiMocks.listTenantInquiries,
        getReviewEligibility: apiMocks.getReviewEligibility,
        createReview: apiMocks.createReview
      }
    }
  };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ListingReviewsPage } from "./listing-reviews-page";
import { normalizeReviewPage } from "./review-page-utils";

const tenant: UserProfile = {
  id: 7,
  displayName: null,
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "anonymous",
    user: null,
    error: null,
    refresh: vi.fn(),
    logout: vi.fn(),
    ...overrides
  };
}

function detail(): PublicListingDetail {
  return {
    id: 42,
    businessStatus: "AVAILABLE",
    title: "Studio có ban công tại Bình Thạnh",
    description: "Phòng sáng và thoáng.",
    monthlyRent: 6_500_000,
    roomAreaSqm: 32,
    maxOccupants: 2,
    areaName: "Bình Thạnh",
    latitude: 10.8,
    longitude: 106.7,
    propertyType: { code: "STUDIO", label: "Căn studio" },
    amenities: [],
    images: [],
    landlordVerified: true,
    hasReported: false,
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function publicReview(id = 1) {
  return {
    id,
    overallRating: 5,
    accuracyRating: 4,
    responsivenessRating: 5,
    comment: "Phòng đúng mô tả, chủ nhà phản hồi nhanh và lịch sự.",
    createdAt: "2026-08-23T00:00:00.000Z",
    verifiedInteraction: true as const
  };
}

const closedInquiry = {
  id: 7,
  listingId: 42,
  status: "CLOSED" as const,
  contactPhone: null,
  preferredContactAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  canSendMessage: true,
  blockedByCurrentUser: false,
  messages: []
};

beforeEach(() => {
  apiMocks.getPublicDetail.mockReset();
  apiMocks.listReviews.mockReset();
  apiMocks.listTenantInquiries.mockReset();
  apiMocks.getReviewEligibility.mockReset();
  apiMocks.createReview.mockReset();
  useAuthMock.mockReturnValue(authValue());
  apiMocks.getPublicDetail.mockResolvedValue(detail());
  apiMocks.listReviews.mockResolvedValue({
    data: [publicReview()],
    pagination: { page: 1, pageSize: 10, hasNextPage: false }
  });
  apiMocks.listTenantInquiries.mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 100, hasNextPage: false }
  });
});

describe("ListingReviewsPage", () => {
  it("normalizes invalid URL pages to page one", () => {
    expect(normalizeReviewPage(undefined)).toBe(1);
    expect(normalizeReviewPage("0")).toBe(1);
    expect(normalizeReviewPage("-2")).toBe(1);
    expect(normalizeReviewPage("abc")).toBe(1);
    expect(normalizeReviewPage("2")).toBe(2);
  });

  it("loads the dedicated page with pageSize ten and keeps the review form hidden for guests", async () => {
    render(<ListingReviewsPage listingId="42" page={1} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Đánh giá tin đăng" })).toBeInTheDocument();
    expect(screen.getByText("Studio có ban công tại Bình Thạnh")).toBeInTheDocument();
    expect(screen.getByText("Người thuê ẩn danh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Viết đánh giá" })).not.toBeInTheDocument();
    expect(apiMocks.listReviews).toHaveBeenCalledWith(42, { page: 1, pageSize: 10 }, expect.any(AbortSignal));
    expect(apiMocks.listTenantInquiries).not.toHaveBeenCalled();
    expect(screen.queryByText("Độ chính xác của tin")).not.toBeInTheDocument();
    expect(screen.queryByText("Mức độ phản hồi")).not.toBeInTheDocument();
  });

  it("uses real previous and next page URLs from the API cursor", async () => {
    apiMocks.listReviews.mockResolvedValueOnce({
      data: [publicReview()],
      pagination: { page: 2, pageSize: 10, hasNextPage: true }
    });
    render(<ListingReviewsPage listingId="42" page={2} />);

    expect(await screen.findByRole("navigation", { name: "Phân trang đánh giá" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Trước/i })).toHaveAttribute("href", "/listings/42/reviews?page=1");
    expect(screen.getByRole("link", { name: /Sau/i })).toHaveAttribute("href", "/listings/42/reviews?page=3");
    expect(apiMocks.listReviews).toHaveBeenCalledWith(42, { page: 2, pageSize: 10 }, expect.any(AbortSignal));
  });

  it("hides pagination when the API reports a single review page", async () => {
    render(<ListingReviewsPage listingId="42" page={1} />);

    await screen.findByText("Người thuê ẩn danh");
    expect(screen.queryByRole("navigation", { name: "Phân trang đánh giá" })).not.toBeInTheDocument();
  });

  it("opens the existing review form only for an eligible tenant", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    apiMocks.listTenantInquiries.mockResolvedValue({
      data: [closedInquiry],
      pagination: { page: 1, pageSize: 100, hasNextPage: false }
    });
    apiMocks.getReviewEligibility.mockResolvedValue({ eligible: true, reason: null, review: null });

    render(<ListingReviewsPage listingId="42" page={1} />);

    const writeButton = await screen.findByRole("button", { name: "Viết đánh giá" });
    expect(apiMocks.listTenantInquiries).toHaveBeenCalledWith({ page: 1, pageSize: 100 }, expect.any(AbortSignal));
    fireEvent.click(writeButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Gửi đánh giá" })).toBeInTheDocument();
  });

  it("closes the form after submission without adding the pending review to the public list", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    apiMocks.listTenantInquiries.mockResolvedValue({
      data: [closedInquiry],
      pagination: { page: 1, pageSize: 100, hasNextPage: false }
    });
    apiMocks.getReviewEligibility.mockResolvedValue({ eligible: true, reason: null, review: null });
    apiMocks.createReview.mockResolvedValue({
      id: 99,
      inquiryId: 7,
      listingId: 42,
      overallRating: 5,
      accuracyRating: 5,
      responsivenessRating: 5,
      comment: "Đánh giá mới đang chờ kiểm duyệt.",
      status: "PENDING",
      moderationNote: null,
      createdAt: "2026-08-24T00:00:00.000Z",
      reviewedAt: null
    });

    render(<ListingReviewsPage listingId="42" page={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "Viết đánh giá" }));
    await screen.findByRole("button", { name: "Gửi đánh giá" });
    fireEvent.change(screen.getByLabelText("Nhận xét"), {
      target: { value: "Đánh giá mới đang chờ kiểm duyệt và chưa công khai." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi đánh giá" }));

    await waitFor(() => expect(apiMocks.createReview).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent("đang chờ duyệt");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Đánh giá mới đang chờ kiểm duyệt.")).not.toBeInTheDocument();
  });
});

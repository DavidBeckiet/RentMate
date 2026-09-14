import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { PublicListingDetail } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getPublicDetail: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("./listing-card", () => ({
  ListingCard: ({ listing }: { listing: { id: number; title: string } }) => (
    <article data-testid={`recent-listing-${listing.id}`}>{listing.title}</article>
  )
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RecentlyViewed } from "./recently-viewed";
import { rememberRecentListing } from "./recently-viewed-storage";

function detail(id: number, title: string): PublicListingDetail {
  return {
    id,
    title,
    description: "Phòng sáng.",
    monthlyRent: 5_000_000,
    roomAreaSqm: 20,
    maxOccupants: 2,
    areaName: "Quận 1",
    latitude: 10.77,
    longitude: 106.69,
    propertyType: { code: "ROOM", label: "Phòng" },
    amenities: [],
    images: [{ url: `https://res.cloudinary.com/rentmate/image/upload/${id}.webp`, altText: null, displayOrder: 1 }],
    landlordVerified: false,
    hasReported: false,
    updatedAt: "2026-08-25T00:00:00.000Z",
    businessStatus: "AVAILABLE"
  };
}

beforeEach(() => {
  window.localStorage.clear();
  apiMocks.getPublicDetail.mockReset();
  useAuthMock.mockReturnValue({
    status: "authenticated",
    user: {
      id: 7,
      role: "TENANT",
      displayName: "Tenant",
      email: "tenant@example.com",
      phone: null,
      isActive: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    },
    error: null,
    refresh: vi.fn(),
    logout: vi.fn()
  });
});

describe("RecentlyViewed", () => {
  it("renders an empty state without requesting the public API when there is no history", async () => {
    render(<RecentlyViewed />);

    expect(await screen.findByRole("heading", { name: "Bạn chưa xem phòng nào" })).toBeInTheDocument();
    expect(apiMocks.getPublicDetail).not.toHaveBeenCalled();
  });

  it("loads stored ids in recent-first order and renders safe public summaries", async () => {
    rememberRecentListing(42, undefined, 10);
    rememberRecentListing(41, undefined, 20);
    apiMocks.getPublicDetail.mockImplementation((id: number) => Promise.resolve(detail(id, `Phòng ${id}`)));

    render(<RecentlyViewed />);

    expect(await screen.findByTestId("recent-listing-41")).toHaveTextContent("Phòng 41");
    expect(screen.getByTestId("recent-listing-42")).toHaveTextContent("Phòng 42");
    expect(screen.getAllByRole("button", { name: "Cân nhắc cùng người ở ghép" })).toHaveLength(2);
    expect(apiMocks.getPublicDetail.mock.calls.map(([id]) => id)).toEqual([41, 42]);
  });

  it("removes listings that are no longer public and keeps the remaining history", async () => {
    rememberRecentListing(41, undefined, 10);
    rememberRecentListing(42, undefined, 20);
    apiMocks.getPublicDetail
      .mockRejectedValueOnce(
        new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
      )
      .mockResolvedValueOnce(detail(41, "Phòng còn công khai"));

    render(<RecentlyViewed />);

    expect(await screen.findByTestId("recent-listing-41")).toBeInTheDocument();
    expect(screen.queryByTestId("recent-listing-42")).not.toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem("rentmate_recent_listings_v1")).not.toContain('"id":42'));
  });

  it("shows a retryable error for a non-404 API failure", async () => {
    rememberRecentListing(42, undefined, 10);
    apiMocks.getPublicDetail.mockRejectedValue(
      new ApiError({ status: 503, code: "SERVICE_UNAVAILABLE", message: "private", category: "backend" })
    );

    render(<RecentlyViewed />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải lịch sử xem lúc này");
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});

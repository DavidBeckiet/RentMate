import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { PublicListingDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getPublicDetail: vi.fn(), listReviews: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));
vi.mock("../../components/map/map-base", () => ({
  MapBase: ({ ariaLabel, markers }: { ariaLabel: string; markers: readonly { label: string }[] }) => (
    <div role="region" aria-label={ariaLabel}>
      {markers.map((marker) => (
        <span key={marker.label}>{marker.label}</span>
      ))}
    </div>
  )
}));

import { ApiError } from "../../lib/api/client";
import { ListingDetail } from "./listing-detail";

const tenant: UserProfile = {
  id: 7,
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

function detail(overrides: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return {
    id: 42,
    title: "Studio sáng gần trung tâm",
    description: "Phòng có ánh sáng tự nhiên.",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    areaName: "Bến Thành, Quận 1",
    latitude: 10.772,
    longitude: 106.698,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    images: [
      { url: "https://res.cloudinary.com/rentmate/image/upload/second.webp", altText: "Ảnh thứ hai", displayOrder: 2 },
      { url: "https://res.cloudinary.com/rentmate/image/upload/first.webp", altText: null, displayOrder: 1 }
    ],
    landlordVerified: false,
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

function backendError(status: number): ApiError {
  return new ApiError({ status, code: "SAFE_ERROR", message: "private", category: "backend" });
}

beforeEach(() => {
  apiMocks.getPublicDetail.mockReset();
  apiMocks.listReviews.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, hasNextPage: false } });
  useAuthMock.mockReturnValue(authValue());
});

describe("ListingDetail", () => {
  it("renders a generic action only after public detail succeeds", async () => {
    apiMocks.getPublicDetail.mockResolvedValue(detail());
    render(<ListingDetail listingId="42" actions={<button type="button">Tác vụ ngoài</button>} />);

    expect(screen.queryByRole("button", { name: "Tác vụ ngoài" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Tác vụ ngoài" })).toBeInTheDocument();
  });

  it("does not render the generic action in loading or unavailable states", async () => {
    let rejectDetail: ((reason: unknown) => void) | undefined;
    apiMocks.getPublicDetail.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDetail = reject;
      })
    );
    render(<ListingDetail listingId="42" actions={<button type="button">Tác vụ ngoài</button>} />);

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải tin đăng");
    expect(screen.queryByRole("button", { name: "Tác vụ ngoài" })).not.toBeInTheDocument();
    rejectDetail?.(backendError(404));
    expect(await screen.findByRole("alert")).toHaveTextContent("không tồn tại hoặc hiện không khả dụng");
    expect(screen.queryByRole("button", { name: "Tác vụ ngoài" })).not.toBeInTheDocument();
  });

  it("loads public detail without waiting for auth and renders ordered images plus approximate location", async () => {
    apiMocks.getPublicDetail.mockResolvedValue(detail());
    render(<ListingDetail listingId="42" />);

    expect(apiMocks.getPublicDetail).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(await screen.findByRole("heading", { level: 1, name: "Studio sáng gần trung tâm" })).toBeInTheDocument();
    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAccessibleName("Ảnh chính của Studio sáng gần trung tâm");
    expect(images[1]).toHaveAccessibleName("Ảnh thứ hai");
    expect(screen.getByRole("region", { name: "Bản đồ vị trí xấp xỉ của tin đăng" })).toBeInTheDocument();
    expect(screen.getAllByText(/Vị trí xấp xỉ/i).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/10\.772|106\.698|addressText|landlordId|moderation/i);
    expect(screen.getByRole("link", { name: "Đăng nhập bằng tài khoản người thuê" })).toHaveAttribute("href", "/login");
  });

  it("renders email and phone only when landlordContact exists in the backend response", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    apiMocks.getPublicDetail.mockResolvedValue(
      detail({ landlordContact: { email: "owner@example.com", phone: "+84901234567" } })
    );
    render(<ListingDetail listingId="42" />);

    expect(await screen.findByRole("link", { name: "owner@example.com" })).toHaveAttribute(
      "href",
      "mailto:owner@example.com"
    );
    expect(screen.getByRole("link", { name: "+84901234567" })).toHaveAttribute("href", "tel:+84901234567");
  });

  it("renders only the public verification badge when the landlord is verified", async () => {
    apiMocks.getPublicDetail.mockResolvedValue(detail({ landlordVerified: true }));
    render(<ListingDetail listingId="42" />);
    expect(await screen.findByText("Hồ sơ chủ trọ đã được RentMate duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /@/ })).not.toBeInTheDocument();
  });

  it("does not fabricate contact for an authenticated tenant when the response omits it", async () => {
    useAuthMock.mockReturnValue(authValue({ status: "authenticated", user: tenant }));
    apiMocks.getPublicDetail.mockResolvedValue(detail());
    render(<ListingDetail listingId="42" />);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByRole("link", { name: /@/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đăng nhập bằng tài khoản người thuê" })).not.toBeInTheDocument();
    expect(screen.getByText("Thông tin liên hệ không có trong phản hồi hiện tại.")).toBeInTheDocument();
  });

  it("keeps landlord/admin public detail contact-free without tenant login guidance", async () => {
    useAuthMock.mockReturnValue(
      authValue({ status: "authenticated", user: { ...tenant, role: "LANDLORD", phone: "+84901234567" } })
    );
    apiMocks.getPublicDetail.mockResolvedValue(detail());
    render(<ListingDetail listingId="42" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Đăng nhập bằng tài khoản người thuê/)).not.toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
  });

  it("collapses 404 into the generic public unavailable state", async () => {
    apiMocks.getPublicDetail.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "hidden reason", category: "backend" })
    );
    render(<ListingDetail listingId="42" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("không tồn tại hoặc hiện không khả dụng");
    expect(screen.getByRole("alert")).not.toHaveTextContent("hidden reason");
  });

  it.each(["abc", "0", "-1", "2147483648"])("rejects malformed listing id %s without a request", (listingId) => {
    render(<ListingDetail listingId={listingId} />);
    expect(screen.getByRole("alert")).toHaveTextContent("không tồn tại hoặc hiện không khả dụng");
    expect(apiMocks.getPublicDetail).not.toHaveBeenCalled();
  });

  it("offers explicit retry for the current ID after a network error", async () => {
    apiMocks.getPublicDetail
      .mockRejectedValueOnce(
        new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
      )
      .mockResolvedValueOnce(detail());
    render(<ListingDetail listingId="42" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải tin đăng");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Studio sáng gần trung tâm" })).toBeInTheDocument();
    expect(apiMocks.getPublicDetail).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale detail response after the route ID changes", async () => {
    let resolveOld: ((value: PublicListingDetail) => void) | undefined;
    let resolveCurrent: ((value: PublicListingDetail) => void) | undefined;
    apiMocks.getPublicDetail
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCurrent = resolve;
        })
      );
    const view = render(<ListingDetail listingId="41" />);
    await waitFor(() => expect(apiMocks.getPublicDetail).toHaveBeenCalledOnce());
    view.rerender(<ListingDetail listingId="42" />);
    await waitFor(() => expect(apiMocks.getPublicDetail).toHaveBeenCalledTimes(2));
    resolveCurrent?.(detail({ title: "Current detail" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Current detail" })).toBeInTheDocument();
    resolveOld?.(detail({ title: "Stale detail" }));
    await waitFor(() => expect(screen.queryByText("Stale detail")).not.toBeInTheDocument());
  });
});

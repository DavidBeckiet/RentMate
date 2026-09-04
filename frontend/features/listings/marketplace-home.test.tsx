import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiPage, PublicListingSummary } from "../../types/api";

const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));

import { MarketplaceHome } from "./marketplace-home";

beforeEach(() => {
  useAuthMock.mockReturnValue({ status: "anonymous", user: null });
});

describe("MarketplaceHome", () => {
  it("uses a Vietnamese-first marketplace hierarchy with real-data empty states", () => {
    render(
      <MarketplaceHome
        propertyTypes={[{ code: "ROOM", label: "Phòng trọ" }]}
        propertyTypesLoading={false}
        listings={null}
        listingsStatus="success"
        listingsError={null}
        onSearch={vi.fn()}
        onRetryListings={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tìm phòng.Tìm người ở ghép.Sống đúng nhịp.");
    expect(screen.getByRole("heading", { name: "Tin đăng mới nhất" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có tin đăng công khai mới")).toBeInTheDocument();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Khám phá tin đăng/ })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("heading", { name: "Bạn đang tìm gì?" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .some(
          (link) =>
            link.getAttribute("href") === "/search" &&
            link.textContent?.includes("Tôi đang tìm chỗ ở") &&
            link.textContent?.includes("Khám phá phòng")
        )
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link")
        .some(
          (link) =>
            link.getAttribute("href") === "/roommates" &&
            link.textContent?.includes("Tôi muốn ở cùng ai đó") &&
            link.textContent.includes("Tìm người ở ghép")
        )
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: /Tìm người ở ghép/ })
        .some((link) => link.getAttribute("href") === "/roommates")
    ).toBe(true);
    expect(screen.getByRole("link", { name: /Xem tất cả phòng/ })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /Đăng phòng trên RentMate/ })).toHaveAttribute(
      "href",
      "/register/landlord"
    );
    expect(screen.getByText("Đăng và cập nhật tin phòng")).toBeInTheDocument();
    expect(screen.getByText("Theo dõi hiệu quả tin đăng")).toBeInTheDocument();
    expect(screen.queryByText("Urban living OS")).not.toBeInTheDocument();
  });

  it("uses the shared listing card hierarchy for homepage results", () => {
    const title = "Căn studio nhiều ánh sáng gần trung tâm với ban công rộng";
    const areaName = "Phường 14, Gò Vấp, Thành phố Hồ Chí Minh";
    const listing: PublicListingSummary = {
      id: 42,
      businessStatus: "AVAILABLE",
      title,
      monthlyRent: 4_800_000,
      roomAreaSqm: 28,
      maxOccupants: 2,
      areaName,
      latitude: 10.81,
      longitude: 106.68,
      propertyType: { code: "APARTMENT", label: "Apartment" },
      amenities: [{ code: "WIFI", label: "Wi-Fi" }],
      coverImage: {
        url: "https://res.cloudinary.com/rentmate/image/upload/apartment.webp",
        altText: null,
        displayOrder: 1
      },
      updatedAt: "2026-08-26T12:00:00.000Z"
    };
    const page: ApiPage<PublicListingSummary> = {
      data: [listing],
      pagination: { page: 1, pageSize: 4, hasNextPage: false }
    };

    render(
      <MarketplaceHome
        propertyTypes={[]}
        propertyTypesLoading={false}
        listings={page}
        listingsStatus="success"
        listingsError={null}
        onSearch={vi.fn()}
        onRetryListings={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: title })).toHaveAttribute("title", title);
    expect(screen.getByTitle(areaName)).toHaveTextContent(areaName);
    const areaLink = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "/search?areaName=" + encodeURIComponent(areaName));
    expect(areaLink).toBeDefined();
    expect(screen.getByText(/4\.800\.000/)).toBeInTheDocument();
    expect(screen.getByText("28 m²")).toBeInTheDocument();
    expect(screen.queryByText("Căn hộ")).not.toBeInTheDocument();
    expect(screen.queryByText("Wi-Fi")).not.toBeInTheDocument();
    expect(screen.getByText(/Cập nhật/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm vào so sánh" })).toHaveAttribute("title", "Thêm vào so sánh");
  });
});

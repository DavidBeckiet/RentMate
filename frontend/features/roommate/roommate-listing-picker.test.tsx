import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiPage, PublicListingDetail, PublicListingSummary } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  favoritesList: vi.fn(),
  getPublicDetail: vi.fn(),
  searchPublic: vi.fn(),
  listPublicAreas: vi.fn(),
  listPropertyTypes: vi.fn()
}));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      favorites: { ...actual.api.favorites, list: apiMocks.favoritesList },
      listings: {
        ...actual.api.listings,
        getPublicDetail: apiMocks.getPublicDetail,
        searchPublic: apiMocks.searchPublic
      },
      lookups: {
        ...actual.api.lookups,
        listPublicAreas: apiMocks.listPublicAreas,
        listPropertyTypes: apiMocks.listPropertyTypes
      }
    }
  };
});
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));

import { RoommateListingPicker } from "./roommate-listing-picker";
import { useComparisonSelection } from "../comparison/comparison-store";
import { rememberRecentListing } from "../listings/recently-viewed-storage";

function listing(id: number, title: string): PublicListingSummary {
  return {
    id,
    businessStatus: "AVAILABLE",
    title,
    monthlyRent: 6_500_000,
    roomAreaSqm: 26,
    maxOccupants: 2,
    areaName: "Quận 3",
    latitude: 10.78,
    longitude: 106.68,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    coverImage: { url: `https://example.test/${id}.jpg`, altText: null, displayOrder: 1 },
    updatedAt: "2026-09-10T00:00:00.000Z"
  };
}

function page(
  data: readonly PublicListingSummary[],
  currentPage = 1,
  hasNextPage = false
): ApiPage<PublicListingSummary> {
  return { data, pagination: { page: currentPage, pageSize: 12, hasNextPage } };
}

function detail(item: PublicListingSummary): PublicListingDetail {
  const { coverImage, ...summary } = item;
  return {
    ...summary,
    description: "Studio sáng và thoáng.",
    images: coverImage ? [coverImage] : [],
    landlordVerified: false,
    hasReported: false
  };
}

function clearComparison(): void {
  const { result, unmount } = renderHook(() => useComparisonSelection());
  act(() => result.current.clear());
  unmount();
}

describe("RoommateListingPicker", () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiMocks.favoritesList.mockReset();
    apiMocks.getPublicDetail.mockReset();
    apiMocks.searchPublic.mockReset();
    apiMocks.listPublicAreas.mockReset();
    apiMocks.listPropertyTypes.mockReset();
    apiMocks.favoritesList.mockResolvedValue(page([]));
    apiMocks.listPublicAreas.mockResolvedValue(["Quận 3", "Bình Thạnh"]);
    apiMocks.listPropertyTypes.mockResolvedValue([{ code: "STUDIO", label: "Studio" }]);
    clearComparison();
  });

  it("opens on saved listings and selects a visual listing option", async () => {
    const saved = listing(11, "Studio gần công viên");
    apiMocks.favoritesList.mockResolvedValue(page([saved]));
    const onSelect = vi.fn();
    render(<RoommateListingPicker selected={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn từ phòng đã lưu" }));
    const dialog = await screen.findByRole("dialog", { name: "Chọn phòng để cùng cân nhắc" });
    expect(await within(dialog).findByText("Studio gần công viên")).toBeInTheDocument();
    expect(apiMocks.favoritesList).toHaveBeenCalledWith({ page: 1, pageSize: 12 }, expect.any(AbortSignal));
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn phòng" }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.id, title: saved.title, coverImage: saved.coverImage })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the listing search contract filters and loads additional pages", async () => {
    apiMocks.searchPublic
      .mockResolvedValueOnce(page([listing(12, "Studio giá vừa")], 1, true))
      .mockResolvedValueOnce(page([listing(13, "Studio tiếp theo")], 2, false));
    render(<RoommateListingPicker selected={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn phòng" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Khu vực"), { target: { value: "Quận 3" } });
    fireEvent.change(within(dialog).getByLabelText("Giá từ (₫/tháng)"), { target: { value: "5000000" } });
    fireEvent.change(within(dialog).getByLabelText("Đến (₫/tháng)"), { target: { value: "9000000" } });
    fireEvent.change(within(dialog).getByLabelText("Loại phòng"), { target: { value: "STUDIO" } });
    fireEvent.change(within(dialog).getByLabelText("Sắp xếp"), { target: { value: "rent_asc" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tìm phòng theo bộ lọc" }));

    await within(dialog).findByText("Studio giá vừa");
    expect(apiMocks.searchPublic).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        areaName: "Quận 3",
        minMonthlyRent: 5_000_000,
        maxMonthlyRent: 9_000_000,
        propertyType: "STUDIO",
        minOccupants: 2,
        page: 1,
        pageSize: 12,
        sort: "rent_asc"
      }),
      expect.any(AbortSignal)
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Tải thêm phòng" }));
    expect(await within(dialog).findByText("Studio tiếp theo")).toBeInTheDocument();
    expect(apiMocks.searchPublic).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2, areaName: "Quận 3", minOccupants: 2 }),
      expect.any(AbortSignal)
    );
  });

  it("offers recent and comparison listings as first-class sources", async () => {
    const recentlyViewed = listing(21, "Phòng vừa xem");
    const compared = listing(22, "Phòng đang so sánh");
    rememberRecentListing(recentlyViewed.id);
    apiMocks.getPublicDetail.mockImplementation(async (id: number) =>
      detail(id === recentlyViewed.id ? recentlyViewed : compared)
    );
    const { result, unmount } = renderHook(() => useComparisonSelection());
    act(() => result.current.toggle(compared.id));
    unmount();

    render(<RoommateListingPicker selected={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn từ phòng đã lưu" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Đã xem gần đây" }));
    expect(await within(dialog).findByText("Phòng vừa xem")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Đang so sánh, 1" }));
    expect(await within(dialog).findByText("Phòng đang so sánh")).toBeInTheDocument();
  });

  it("keeps saved listings as the preferred source and provides a search path when none exist", async () => {
    render(<RoommateListingPicker selected={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn từ phòng đã lưu" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Bạn chưa lưu phòng nào")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tìm phòng" }));
    expect(within(dialog).getByRole("tab", { name: "Tìm phòng" })).toHaveAttribute("aria-selected", "true");
  });
});

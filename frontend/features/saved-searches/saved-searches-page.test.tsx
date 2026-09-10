import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, SavedSearch, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigationMocks = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationMocks.query),
  useRouter: () => ({ push: navigationMocks.push, replace: navigationMocks.replace })
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { savedSearches: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { SavedSearchesPage } from "./saved-searches-page";

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
const refresh = vi.fn<() => Promise<void>>();
const item: SavedSearch = {
  id: 12,
  name: "Gần trường",
  isActive: true,
  query: {
    q: null,
    areaName: "Quận 3",
    minMonthlyRent: 2_000_000,
    maxMonthlyRent: 6_000_000,
    minRoomAreaSqm: null,
    maxRoomAreaSqm: null,
    minOccupants: null,
    propertyType: "APARTMENT",
    amenities: ["WIFI"],
    mode: "ordinary",
    north: null,
    south: null,
    east: null,
    west: null,
    centerLat: null,
    centerLng: null,
    radiusKm: null,
    sort: "rent_asc"
  },
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z"
};

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenant, error: null, refresh, logout: vi.fn(), ...overrides };
}

function page(data: readonly SavedSearch[], currentPage = 1, hasNextPage = false, pageSize = 20): ApiPage<SavedSearch> {
  return { data, pagination: { page: currentPage, pageSize, hasNextPage } };
}

describe("SavedSearchesPage", () => {
  beforeEach(() => {
    navigationMocks.query = "";
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    useAuthMock.mockReturnValue(auth());
    apiMocks.list.mockResolvedValue(page([item]));
    apiMocks.update.mockResolvedValue({ ...item, isActive: false });
    apiMocks.remove.mockResolvedValue(undefined);
    refresh.mockResolvedValue();
  });

  it("loads tenant-owned searches with a bounded page and can pause one", async () => {
    render(<SavedSearchesPage />);

    expect(await screen.findByRole("heading", { name: "Gần trường" })).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "Áp dụng tìm kiếm" })).toHaveAttribute(
      "href",
      "/search?areaName=Qu%E1%BA%ADn+3&minMonthlyRent=2000000&maxMonthlyRent=6000000&propertyType=APARTMENT&amenities=WIFI&sort=rent_asc"
    );
    expect(screen.getByText("Căn hộ")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng" }));
    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(12, { isActive: false }));
    expect(await screen.findByText("Tạm dừng")).toBeInTheDocument();
  });

  it("gates anonymous users without loading private searches", () => {
    useAuthMock.mockReturnValue(auth({ status: "anonymous", user: null }));
    render(<SavedSearchesPage />);

    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(apiMocks.list).not.toHaveBeenCalled();
  });

  it("generates a human name and hides unknown historical lookup codes", async () => {
    apiMocks.list.mockResolvedValue(
      page([
        {
          ...item,
          id: 13,
          name: null,
          query: {
            ...item.query,
            areaName: "Bình Thạnh",
            propertyType: "OLD_ROOM",
            amenities: ["OLD_WIFI"],
            minOccupants: 2,
            minMonthlyRent: null,
            maxMonthlyRent: 8_000_000
          }
        }
      ])
    );
    render(<SavedSearchesPage />);

    expect(await screen.findByRole("heading", { name: "Bình Thạnh · Dưới 8 triệu" })).toBeInTheDocument();
    expect(screen.getByText("Từ 2 người")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("OLD_ROOM");
    expect(document.body).not.toHaveTextContent("OLD_WIFI");
  });

  it("shows safe radius criteria and keeps the distance sort readable", async () => {
    apiMocks.list.mockResolvedValue(
      page([
        {
          ...item,
          id: 14,
          name: "Gần trung tâm",
          query: {
            ...item.query,
            mode: "radius",
            north: null,
            south: null,
            east: null,
            west: null,
            centerLat: 10.776,
            centerLng: 106.7,
            radiusKm: 5,
            sort: "distance_asc"
          }
        }
      ])
    );
    render(<SavedSearchesPage />);

    expect(await screen.findByText("Bán kính 5 km quanh khu vực đã chọn")).toBeInTheDocument();
    expect(screen.getByText("Gần nhất")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("10.776");
  });

  it("uses URL pagination and only shows controls when the API has another page", async () => {
    navigationMocks.query = "page=2";
    apiMocks.list.mockResolvedValue(page([item], 2, true));
    render(<SavedSearchesPage />);

    expect(await screen.findByRole("navigation", { name: "Phân trang tìm kiếm đã lưu" })).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith({ page: 2, pageSize: 20 }, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Trước" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/saved-searches");
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/saved-searches?page=3");
  });

  it("rejects malformed URL pagination locally", () => {
    navigationMocks.query = "page=bad";
    render(<SavedSearchesPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Liên kết phân trang tìm kiếm đã lưu không hợp lệ");
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại liên kết" }));
    expect(navigationMocks.replace).toHaveBeenCalledWith("/saved-searches");
    expect(apiMocks.list).not.toHaveBeenCalled();
  });

  it("returns to the previous page after deleting its final item", async () => {
    navigationMocks.query = "page=2";
    apiMocks.list.mockResolvedValueOnce(page([item], 2, false)).mockResolvedValueOnce(page([], 2, false));
    render(<SavedSearchesPage />);

    await screen.findByRole("heading", { name: "Gần trường" });
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith(12));
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/saved-searches"));
  });

  it("hides pagination for a complete single page", async () => {
    apiMocks.list.mockResolvedValue(page([item], 1, false));
    render(<SavedSearchesPage />);

    await screen.findByRole("heading", { name: "Gần trường" });
    expect(screen.queryByRole("navigation", { name: "Phân trang tìm kiếm đã lưu" })).not.toBeInTheDocument();
  });
});

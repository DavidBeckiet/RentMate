import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ApiPage, SavedSearch, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { savedSearches: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { SavedSearchesPage } from "./saved-searches-page";

const tenant: UserProfile = {
  id: 7,
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

function page(data: readonly SavedSearch[]): ApiPage<SavedSearch> {
  return { data, pagination: { page: 1, pageSize: 100, hasNextPage: false } };
}

describe("SavedSearchesPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(auth());
    apiMocks.list.mockResolvedValue(page([item]));
    apiMocks.update.mockResolvedValue({ ...item, isActive: false });
    apiMocks.remove.mockResolvedValue(undefined);
    refresh.mockResolvedValue();
  });

  it("loads tenant-owned searches and can pause one", async () => {
    render(<SavedSearchesPage />);

    expect(await screen.findByRole("heading", { name: "Gần trường" })).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 100 }, expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: /Chạy tìm kiếm/i })).toHaveAttribute(
      "href",
      expect.stringContaining("areaName=Qu%E1%BA%ADn+3")
    );

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
});

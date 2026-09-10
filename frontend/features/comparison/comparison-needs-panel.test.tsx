import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavedSearch } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  listSavedSearches: vi.fn(),
  listPropertyTypes: vi.fn(),
  listAmenities: vi.fn()
}));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      savedSearches: { list: apiMocks.listSavedSearches },
      lookups: {
        listPropertyTypes: apiMocks.listPropertyTypes,
        listAmenities: apiMocks.listAmenities
      }
    }
  };
});

import { ComparisonNeedsPanel } from "./comparison-needs-panel";

const savedSearch: SavedSearch = {
  id: 12,
  name: null,
  isActive: true,
  query: {
    q: null,
    areaName: "Quận 3",
    minMonthlyRent: null,
    maxMonthlyRent: 5_000_000,
    minRoomAreaSqm: 25,
    maxRoomAreaSqm: null,
    minOccupants: 2,
    propertyType: "STUDIO",
    amenities: ["WIFI"],
    mode: "ordinary",
    north: null,
    south: null,
    east: null,
    west: null,
    centerLat: null,
    centerLng: null,
    radiusKm: null,
    sort: "newest"
  },
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z"
};

describe("ComparisonNeedsPanel", () => {
  it("does not load or auto-select Saved Search until the Tenant chooses it", async () => {
    apiMocks.listSavedSearches.mockReset();
    apiMocks.listSavedSearches.mockResolvedValue({
      data: [savedSearch],
      pagination: { page: 1, pageSize: 50, hasNextPage: false }
    });
    render(
      <ComparisonNeedsPanel
        snapshot={null}
        canUseSavedSearch
        authResolved
        onApplyManual={vi.fn()}
        onApplySaved={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(apiMocks.listSavedSearches).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Nguồn nhu cầu" })).toHaveValue("none");

    fireEvent.change(screen.getByRole("combobox", { name: "Nguồn nhu cầu" }), { target: { value: "saved" } });
    await waitFor(() => expect(apiMocks.listSavedSearches).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("option", { name: "Căn studio Quận 3" })).toBeInTheDocument();
  });

  it("applies manual needs without writing to backend", async () => {
    apiMocks.listPropertyTypes.mockResolvedValue([{ code: "STUDIO", label: "Studio" }]);
    apiMocks.listAmenities.mockResolvedValue([{ code: "WIFI", label: "Wi-Fi" }]);
    const onApplyManual = vi.fn();
    render(
      <ComparisonNeedsPanel
        snapshot={null}
        canUseSavedSearch={false}
        authResolved
        onApplyManual={onApplyManual}
        onApplySaved={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Nguồn nhu cầu" }), { target: { value: "manual" } });
    await waitFor(() => expect(screen.getByLabelText("Khu vực")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Quận 3" } });
    fireEvent.change(screen.getByLabelText("Ngân sách đến"), { target: { value: "5000000" } });
    fireEvent.click(screen.getByLabelText("Wi-Fi"));
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng nhu cầu" }));

    expect(onApplyManual).toHaveBeenCalledWith(
      expect.objectContaining({ areaName: "Quận 3", maxMonthlyRent: 5_000_000, amenities: ["WIFI"] })
    );
  });

  it("keeps an unavailable saved snapshot visible instead of silently switching source", async () => {
    apiMocks.listSavedSearches.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 50, hasNextPage: false }
    });
    render(
      <ComparisonNeedsPanel
        snapshot={{
          source: "saved",
          sourceId: 999,
          sourceLabel: "Studio Quận 3",
          criteria: { areaName: "Quận 3", amenities: [] }
        }}
        canUseSavedSearch
        authResolved
        onApplyManual={vi.fn()}
        onApplySaved={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("không còn khả dụng"));
    expect(screen.getByText("Quận 3")).toBeInTheDocument();
  });
});

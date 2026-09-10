import { describe, expect, it } from "vitest";
import { savedSearchUrl, toSavedSearchQuery } from "./saved-search-query";
import { parseSearchQuery } from "../listings/search-query";

describe("saved search query mapping", () => {
  it("drops paging when saving and restores the ordinary search URL", () => {
    const query = toSavedSearchQuery({
      mode: "ordinary",
      q: "phòng sáng",
      areaName: "Quận 3",
      amenities: ["WIFI"],
      page: 4,
      pageSize: 20,
      sort: "rent_asc"
    });
    expect(query).not.toHaveProperty("page");
    expect(savedSearchUrl(query)).toBe(
      "/search?q=ph%C3%B2ng+s%C3%A1ng&areaName=Qu%E1%BA%ADn+3&amenities=WIFI&sort=rent_asc"
    );
  });

  it("keeps a radius search complete and distance sorted", () => {
    const query = toSavedSearchQuery({
      mode: "radius",
      amenities: [],
      centerLat: 10.7769,
      centerLng: 106.7009,
      radiusKm: 8,
      page: 2,
      pageSize: 15,
      sort: "distance_asc"
    });
    expect(query.mode).toBe("radius");
    expect(savedSearchUrl(query)).toContain("radiusKm=8");
    expect(savedSearchUrl(query)).toContain("sort=distance_asc");
    expect(savedSearchUrl(query)).not.toContain("page=2");
    expect(savedSearchUrl(query)).not.toContain("north=");
  });

  it("keeps a bounds search complete without leaking radius fields", () => {
    const query = toSavedSearchQuery({
      mode: "bounds",
      amenities: [],
      north: 10.9,
      south: 10.6,
      east: 106.9,
      west: 106.5,
      page: 2,
      pageSize: 15,
      sort: "rent_asc"
    });

    expect(savedSearchUrl(query)).toContain("north=10.9");
    expect(savedSearchUrl(query)).toContain("south=10.6");
    expect(savedSearchUrl(query)).toContain("sort=rent_asc");
    expect(savedSearchUrl(query)).not.toContain("centerLat=");
    expect(savedSearchUrl(query)).not.toContain("radiusKm=");
  });

  it("omits historical unsupported codes when applying a saved search", () => {
    const url = savedSearchUrl({
      mode: "ordinary",
      q: null,
      areaName: null,
      minMonthlyRent: null,
      maxMonthlyRent: null,
      minRoomAreaSqm: null,
      maxRoomAreaSqm: null,
      minOccupants: null,
      propertyType: "LEGACY_TYPE",
      amenities: ["LEGACY_AMENITY"],
      north: null,
      south: null,
      east: null,
      west: null,
      centerLat: null,
      centerLng: null,
      radiusKm: null,
      sort: "legacy_sort" as never
    });

    expect(url).toBe("/search");
    expect(url).not.toMatch(/LEGACY_TYPE|LEGACY_AMENITY|legacy_sort/);
  });

  it("round-trips all structured ordinary criteria back into Search page one", () => {
    const url = savedSearchUrl({
      mode: "ordinary",
      q: "studio có gác",
      areaName: "Quận 3",
      minMonthlyRent: 20_000_000,
      maxMonthlyRent: 20_000_000,
      minRoomAreaSqm: 23.25,
      maxRoomAreaSqm: 29.99,
      minOccupants: 2,
      propertyType: "STUDIO",
      amenities: ["WIFI", "WASHING_MACHINE"],
      north: null,
      south: null,
      east: null,
      west: null,
      centerLat: null,
      centerLng: null,
      radiusKm: null,
      sort: "rent_desc"
    });

    const parsed = parseSearchQuery(new URL(url, "http://localhost").searchParams);
    expect(parsed).toEqual({
      ok: true,
      state: {
        mode: "ordinary",
        q: "studio có gác",
        areaName: "Quận 3",
        minMonthlyRent: 20_000_000,
        maxMonthlyRent: 20_000_000,
        minRoomAreaSqm: 23.25,
        maxRoomAreaSqm: 29.99,
        minOccupants: 2,
        propertyType: "STUDIO",
        amenities: ["WASHING_MACHINE", "WIFI"],
        page: 1,
        pageSize: 20,
        sort: "rent_desc"
      }
    });
  });
});

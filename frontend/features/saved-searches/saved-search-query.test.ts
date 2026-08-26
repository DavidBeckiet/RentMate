import { describe, expect, it } from "vitest";
import { savedSearchUrl, toSavedSearchQuery } from "./saved-search-query";

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
});

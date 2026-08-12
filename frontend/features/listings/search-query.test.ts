import { describe, expect, it } from "vitest";
import {
  applySearchFilters,
  parseSearchQuery,
  serializeSearchState,
  toPublicListingSearchQuery,
  withBounds,
  withPage,
  withRadius
} from "./search-query";

function parse(query: string) {
  return parseSearchQuery(new URLSearchParams(query));
}

describe("RM-048 search query state", () => {
  it("parses and forwards every ordinary filter while ignoring unknown browser keys", () => {
    const result = parse(
      "q=%20Studio%20&areaName=Quan%201&minMonthlyRent=3000000&maxMonthlyRent=9000000&minRoomAreaSqm=18.5&maxRoomAreaSqm=45.25&propertyType=studio&amenities=WIFI,WIFI,parking&page=2&pageSize=40&sort=rent_asc&campaign=summer"
    );

    expect(result).toEqual({
      ok: true,
      state: {
        mode: "ordinary",
        q: "Studio",
        areaName: "Quan 1",
        minMonthlyRent: 3_000_000,
        maxMonthlyRent: 9_000_000,
        minRoomAreaSqm: 18.5,
        maxRoomAreaSqm: 45.25,
        propertyType: "STUDIO",
        amenities: ["PARKING", "WIFI"],
        page: 2,
        pageSize: 40,
        sort: "rent_asc"
      }
    });
    if (result.ok) expect(toPublicListingSearchQuery(result.state)).not.toHaveProperty("campaign");
  });

  it("uses stable serialization, omits blank/default values, and preserves retired lookup codes", () => {
    const result = parse("q=%20%20&propertyType=retired_room&amenities=old_wifi,WIFI");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(serializeSearchState(result.state).toString()).toBe("propertyType=RETIRED_ROOM&amenities=OLD_WIFI%2CWIFI");
  });

  it.each([
    ["partial bounds", "north=11&south=10&east=107"],
    ["partial radius", "centerLat=10.7&radiusKm=5"],
    ["both geographic groups", "north=11&south=10&east=107&west=106&centerLat=10.7&centerLng=106.7&radiusKm=5"],
    ["non-finite known number", "minRoomAreaSqm=NaN"],
    ["nonpositive page", "page=0"],
    ["incompatible radius sort", "centerLat=10.7&centerLng=106.7&radiusKm=5&sort=newest"]
  ])("returns a safe local error for %s", (_label, query) => {
    expect(parse(query)).toEqual(expect.objectContaining({ ok: false, message: expect.any(String) }));
  });

  it("commits bounds and radius as mutually exclusive groups with page and sort reset", () => {
    const radius = parse("q=studio&centerLat=10.7&centerLng=106.7&radiusKm=8&page=4&sort=distance_asc");
    if (!radius.ok) throw new Error(radius.message);

    const bounds = withBounds(radius.state, { north: 10.9, south: 10.6, east: 106.9, west: 106.5 });
    expect(bounds).toMatchObject({ mode: "bounds", page: 1, sort: "newest" });
    expect(serializeSearchState(bounds).toString()).toBe("q=studio&north=10.9&south=10.6&east=106.9&west=106.5");

    const nextRadius = withRadius(bounds, { latitude: 10.75, longitude: 106.68 }, 12.5);
    expect(serializeSearchState(nextRadius).toString()).toBe(
      "q=studio&centerLat=10.75&centerLng=106.68&radiusKm=12.5&sort=distance_asc"
    );
  });

  it("resets page for filter/sort changes and changes only page for pagination", () => {
    const initial = parse("q=room&page=3&pageSize=60&sort=rent_desc");
    if (!initial.ok) throw new Error(initial.message);
    const filtered = applySearchFilters(initial.state, { q: "studio", amenities: ["WIFI"] }, "rent_asc");
    expect(filtered).toMatchObject({ q: "studio", amenities: ["WIFI"], page: 1, pageSize: 60, sort: "rent_asc" });

    expect(withPage(filtered, 2)).toEqual({ ...filtered, page: 2 });
  });

  it("supports pageSize 1 through 100 without exposing a selector policy", () => {
    expect(parse("pageSize=1")).toEqual(expect.objectContaining({ ok: true }));
    expect(parse("pageSize=100")).toEqual(expect.objectContaining({ ok: true }));
    expect(parse("pageSize=101")).toEqual(expect.objectContaining({ ok: false }));
  });
});

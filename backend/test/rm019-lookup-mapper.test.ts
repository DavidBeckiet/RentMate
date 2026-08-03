import { describe, expect, it } from "vitest";
import {
  LookupValueMappingError,
  mapAmenityToDto,
  mapLookupValueRow,
  mapPropertyTypeToDto
} from "../src/modules/listings/lookup-mapper.js";

describe("RM-019 lookup mapping", () => {
  it("maps property types and amenities to exact frozen DTOs without mutating the source", () => {
    const row = Object.freeze({
      code: "STUDIO",
      label: "Studio",
      id: 91,
      is_active: true,
      arbitrary_private_field: "must-not-leak"
    });
    const before = { ...row };
    const value = mapLookupValueRow(row);
    const propertyType = mapPropertyTypeToDto(value);
    const amenity = mapAmenityToDto({ code: "WIFI", label: "Wi-Fi" });

    expect(value).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(amenity).toStrictEqual({ code: "WIFI", label: "Wi-Fi" });
    expect(Object.keys(propertyType)).toStrictEqual(["code", "label"]);
    expect(Object.keys(amenity)).toStrictEqual(["code", "label"]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(propertyType)).toBe(true);
    expect(Object.isFrozen(amenity)).toBe(true);
    expect(row).toStrictEqual(before);
  });

  it.each([
    ["invalid code type", { code: 7, label: "Studio" }],
    ["invalid code representation", { code: "studio", label: "Studio" }],
    ["invalid label type", { code: "STUDIO", label: 7 }],
    ["invalid label representation", { code: "STUDIO", label: " Studio " }]
  ] as const)("rejects %s without exposing raw values", (_label, row) => {
    expect(() => mapLookupValueRow(row)).toThrow(LookupValueMappingError);
    try {
      mapLookupValueRow(row);
    } catch (error) {
      expect(String(error)).not.toContain(JSON.stringify(row));
      expect(String(error)).not.toContain(String(row.code));
      expect(String(error)).not.toContain(String(row.label));
    }
  });
});

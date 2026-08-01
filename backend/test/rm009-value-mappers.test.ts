import { describe, expect, it } from "vitest";
import {
  DatabaseValueMappingError,
  mapNullablePgScaleTwoNumeric,
  mapNullablePgTimestamptz,
  mapNullablePgWholeNumeric,
  mapPgScaleTwoNumeric,
  mapPgTimestamptz,
  mapPgWholeNumeric
} from "../src/db/value-mappers.js";

describe("RM-009 PostgreSQL whole numeric mapping", () => {
  it.each([
    ["1", 1],
    ["999999999999", 999_999_999_999],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
    ["0", 0],
    ["-42", -42]
  ])("maps canonical safe integer %s", (input, expected) => {
    expect(mapPgWholeNumeric(input, "monthly_rent")).toBe(expected);
  });

  it.each(["", " 1", "1 ", "1.0", "1e3", "NaN", "Infinity", "01", "9007199254740992"])(
    "rejects malformed or unsafe whole numeric %s",
    (input) => {
      expect(() => mapPgWholeNumeric(input, "monthly_rent")).toThrow(DatabaseValueMappingError);
    }
  );

  it("maps only database null to application null", () => {
    expect(mapNullablePgWholeNumeric(null, "monthly_rent")).toBeNull();
    expect(() => mapNullablePgWholeNumeric(undefined, "monthly_rent")).toThrow(DatabaseValueMappingError);
  });
});

describe("RM-009 PostgreSQL scale-two numeric mapping", () => {
  it.each([
    ["1", 1],
    ["1.00", 1],
    ["12.34", 12.34],
    ["999999.99", 999_999.99],
    ["-12.34", -12.34]
  ])("deliberately maps valid numeric %s", (input, expected) => {
    expect(mapPgScaleTwoNumeric(input, "room_area_sqm")).toBe(expected);
  });

  it.each(["", " 1.00", "1.00 ", "1e2", "1.234", "NaN", "Infinity", "1000000.00", "01.00"])(
    "rejects malformed, excess-scale, or out-of-range numeric %s without rounding",
    (input) => {
      expect(() => mapPgScaleTwoNumeric(input, "room_area_sqm")).toThrow(DatabaseValueMappingError);
    }
  );

  it("maps only database null to application null", () => {
    expect(mapNullablePgScaleTwoNumeric(null, "room_area_sqm")).toBeNull();
    expect(() => mapNullablePgScaleTwoNumeric(undefined, "room_area_sqm")).toThrow(DatabaseValueMappingError);
  });
});

describe("RM-009 PostgreSQL timestamptz mapping", () => {
  it("clones a valid Date while preserving its exact UTC instant", () => {
    const input = new Date("2026-07-31T08:15:30.123Z");
    const mapped = mapPgTimestamptz(input, "created_at");

    expect(mapped).not.toBe(input);
    expect(mapped.getTime()).toBe(input.getTime());
    expect(mapped.toISOString()).toBe("2026-07-31T08:15:30.123Z");
  });

  it("accepts an explicit non-UTC offset and preserves the represented instant", () => {
    const mapped = mapPgTimestamptz("2026-07-31T15:15:30.123+07:00", "created_at");

    expect(mapped.toISOString()).toBe("2026-07-31T08:15:30.123Z");
  });

  it.each([new Date(Number.NaN), "", "2026-07-31T08:15:30", "2026-02-31T08:15:30Z", {}, undefined])(
    "rejects invalid, ambiguous, object, or missing timestamp input",
    (input) => {
      expect(() => mapPgTimestamptz(input, "created_at")).toThrow(DatabaseValueMappingError);
    }
  );

  it("maps only database null to application null", () => {
    expect(mapNullablePgTimestamptz(null, "created_at")).toBeNull();
    expect(() => mapNullablePgTimestamptz(undefined, "created_at")).toThrow(DatabaseValueMappingError);
  });

  it("sanitizes an unsafe field name and omits the malformed raw value", () => {
    const privateValue = "private-address-value";

    expect(() => mapPgWholeNumeric(privateValue, "bad field\nsecret")).toThrow(
      "database value must be a valid whole PostgreSQL numeric."
    );

    try {
      mapPgWholeNumeric(privateValue, "bad field\nsecret");
    } catch (error) {
      expect(String(error)).not.toContain(privateValue);
      expect(String(error)).not.toContain("secret");
    }
  });
});

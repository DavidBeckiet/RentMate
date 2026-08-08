import { describe, expect, it } from "vitest";
import { validateQueryKeys } from "../src/shared/validation/request.js";
import { validateForwardGeocodingInput } from "../src/modules/listings/geocoding-validation.js";

describe("RM-033 geocoding validation", () => {
  it("trims only outer whitespace and preserves internal text", () => {
    expect(validateForwardGeocodingInput({ addressText: "  101  Đường Ví Dụ  " })).toStrictEqual({
      addressText: "101  Đường Ví Dụ"
    });
  });

  it("accepts exactly 500 Unicode code points and rejects 501", () => {
    expect(validateForwardGeocodingInput({ addressText: "🏠".repeat(500) }).addressText).toHaveLength(1_000);
    expect(() => validateForwardGeocodingInput({ addressText: "🏠".repeat(501) })).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" })
    );
  });

  it.each(["", "   "])("rejects blank address %j", (addressText) => {
    expect(() => validateForwardGeocodingInput({ addressText })).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" })
    );
  });

  it.each([undefined, null, [], "body", 1, true])("rejects non-object body %#", (body) => {
    expect(() => validateForwardGeocodingInput(body)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" })
    );
  });

  it.each([{}, { other: "x" }, { addressText: "Address", other: "x" }, { addressText: 12 }])(
    "rejects missing, unknown, or non-string fields %#",
    (body) => {
      expect(() => validateForwardGeocodingInput(body)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_FAILED" })
      );
    }
  );

  it("rejects every query parameter", () => {
    expect(() => validateQueryKeys({ extra: "1" }, [])).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" })
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  parseFavoriteListingId,
  validateFavoriteBody,
  validateFavoriteCollectionQuery,
  validateFavoriteMutationQuery
} from "../src/modules/favorites/favorite-validation.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";

function validationFailure(action: () => unknown): ApplicationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    return error as ApplicationError;
  }
  throw new Error("Expected validation failure.");
}

describe("RM-039 favorite request validation", () => {
  it("normalizes collection pagination and calculates a safe offset", () => {
    expect(validateFavoriteCollectionQuery({})).toStrictEqual({ page: 1, pageSize: 20, offset: 0 });
    expect(validateFavoriteCollectionQuery({ page: "3", pageSize: "100" })).toStrictEqual({
      page: 3,
      pageSize: 100,
      offset: 200
    });
  });

  it.each([
    { page: "0" },
    { pageSize: "0" },
    { pageSize: "101" },
    { page: String(Number.MAX_SAFE_INTEGER) },
    { page: ["1", "2"] },
    { unknown: "value" }
  ])("rejects invalid collection query %#", (query) => {
    expect(validationFailure(() => validateFavoriteCollectionQuery(query)).code).toBe("VALIDATION_FAILED");
  });

  it.each(["1", "0001", "2147483647"])("accepts listing id %s", (value) => {
    expect(parseFavoriteListingId(value)).toBe(Number(value));
  });

  it.each(["", "0", "-1", "+1", "1.5", "1e3", " 1", "1 ", "1x", "2147483648"])(
    "rejects invalid listing id %s",
    (value) => expect(validationFailure(() => parseFavoriteListingId(value)).code).toBe("VALIDATION_FAILED")
  );

  it("rejects duplicate path ids, mutation query fields, and every present body", () => {
    expect(validationFailure(() => parseFavoriteListingId(["1", "2"])).code).toBe("VALIDATION_FAILED");
    expect(validationFailure(() => validateFavoriteMutationQuery({ page: "1" })).code).toBe("VALIDATION_FAILED");
    expect(validationFailure(() => validateFavoriteBody({})).code).toBe("VALIDATION_FAILED");
    expect(validationFailure(() => validateFavoriteBody(null)).code).toBe("VALIDATION_FAILED");
    expect(() => validateFavoriteMutationQuery({})).not.toThrow();
    expect(() => validateFavoriteBody(undefined)).not.toThrow();
  });
});

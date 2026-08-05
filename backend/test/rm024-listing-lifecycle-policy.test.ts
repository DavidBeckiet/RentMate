import { describe, expect, it } from "vitest";
import {
  listingMutationSignificances,
  ListingLifecycleInvariantError,
  resolveListingStatusAfterMutation,
  type ListingMutationSignificance
} from "../src/modules/listings/listing-lifecycle-policy.js";
import { listingStatuses, type ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";

describe("RM-024 listing lifecycle policy", () => {
  it.each([
    ["DRAFT", "DRAFT"],
    ["PENDING", "PENDING"],
    ["REJECTED", "DRAFT"],
    ["APPROVED", "PENDING"],
    ["INACTIVE", "PENDING"],
    ["HIDDEN", "HIDDEN"]
  ] as const)("maps a significant %s mutation to %s", (status, expected) => {
    expect(resolveListingStatusAfterMutation(status, "SIGNIFICANT_CONTENT_CHANGE")).toBe(expected);
  });

  it.each(listingStatuses)("preserves %s for a non-status-changing mutation", (status) => {
    expect(resolveListingStatusAfterMutation(status, "NO_STATUS_CHANGE")).toBe(status);
  });

  it("publishes only the two immutable significance choices", () => {
    expect(listingMutationSignificances).toStrictEqual(["NO_STATUS_CHANGE", "SIGNIFICANT_CONTENT_CHANGE"]);
    expect(Object.isFrozen(listingMutationSignificances)).toBe(true);
    expect(() => (listingMutationSignificances as unknown as string[]).push("UNSUPPORTED")).toThrow(TypeError);
  });

  it.each([
    ["content PATCH change", "SIGNIFICANT_CONTENT_CHANGE"],
    ["amenity change", "SIGNIFICANT_CONTENT_CHANGE"],
    ["future image addition", "SIGNIFICANT_CONTENT_CHANGE"],
    ["future image deletion", "SIGNIFICANT_CONTENT_CHANGE"],
    ["normalized PATCH no-op", "NO_STATUS_CHANGE"],
    ["future image reorder", "NO_STATUS_CHANGE"]
  ] as const)("supports caller classification for %s", (_operation, significance) => {
    expect(resolveListingStatusAfterMutation("APPROVED", significance)).toBe(
      significance === "SIGNIFICANT_CONTENT_CHANGE" ? "PENDING" : "APPROVED"
    );
  });

  it("fails safely for unknown runtime state without including raw values", () => {
    const invokeStatus = () =>
      resolveListingStatusAfterMutation("PRIVATE-STATUS" as ListingStatus, "SIGNIFICANT_CONTENT_CHANGE");
    const invokeSignificance = () =>
      resolveListingStatusAfterMutation("DRAFT", "PRIVATE-ACTION" as ListingMutationSignificance);
    expect(invokeStatus).toThrow(ListingLifecycleInvariantError);
    expect(invokeSignificance).toThrow(ListingLifecycleInvariantError);
    for (const invoke of [invokeStatus, invokeSignificance]) {
      try {
        invoke();
      } catch (error) {
        expect((error as Error).message).toBe("Listing lifecycle state is invalid.");
        expect((error as Error).message).not.toMatch(/PRIVATE|submit|deactivate|reactivate|admin/i);
      }
    }
  });
});

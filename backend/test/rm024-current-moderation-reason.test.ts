import { describe, expect, it } from "vitest";
import {
  CurrentModerationReasonInvariantError,
  requiresCurrentModerationReason,
  resolveCurrentModerationReason
} from "../src/modules/listings/current-moderation-reason.js";
import { listingStatuses, type ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";

describe("RM-024 current moderation reason policy", () => {
  it.each(listingStatuses)("defines reason applicability exhaustively for %s", (status) => {
    expect(requiresCurrentModerationReason(status)).toBe(status === "REJECTED" || status === "HIDDEN");
  });

  it.each([
    ["REJECTED", "Needs a clearer title"],
    ["HIDDEN", "  Policy review required  "]
  ] as const)("preserves a valid %s reason exactly", (status, reason) => {
    expect(resolveCurrentModerationReason(status, reason)).toBe(reason);
  });

  it.each([undefined, null, "", "   ", "x".repeat(1_001), 42, {}, { reason: "raw history" }])(
    "rejects invalid applicable reason representation",
    (reason) => {
      expect(() => resolveCurrentModerationReason("REJECTED", reason)).toThrow(CurrentModerationReasonInvariantError);
    }
  );

  it.each(["DRAFT", "PENDING", "APPROVED", "INACTIVE"] as const)(
    "returns null for non-applicable %s and rejects stale projection",
    (status) => {
      expect(resolveCurrentModerationReason(status, null)).toBeNull();
      expect(() => resolveCurrentModerationReason(status, "Old private reason")).toThrow(
        CurrentModerationReasonInvariantError
      );
    }
  );

  it("fails for unknown runtime status with a stable non-disclosing error", () => {
    const secretReason = "private reason content 998877";
    let failure: Error | undefined;
    try {
      resolveCurrentModerationReason("PRIVATE-STATUS" as ListingStatus, secretReason);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure).toBeInstanceOf(CurrentModerationReasonInvariantError);
    expect(failure?.message).toBe("Current moderation reason is invalid.");
    expect(failure?.message).not.toMatch(/PRIVATE|998877|listing|owner|admin|row/i);
  });
});

import { describe, expect, it } from "vitest";
import { validateModerationActionBody } from "../src/modules/listings/moderation-action-validation.js";

function expectValidation(value: unknown): void {
  expect(() => validateModerationActionBody(value)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
}

describe("RM-042 moderation action validation", () => {
  it.each([
    [" approve ", "APPROVE"],
    ["reject", "REJECT"],
    [" HIDE", "HIDE"],
    ["restore ", "RESTORE"]
  ] as const)("normalizes %s to %s", (raw, action) => {
    const reason = action === "REJECT" || action === "HIDE" ? " required " : undefined;
    expect(validateModerationActionBody({ action: raw, ...(reason === undefined ? {} : { reason }) })).toStrictEqual({
      action,
      reason: reason?.trim() ?? null
    });
  });

  it.each([undefined, null, [], "body", 1, true, {}, { action: "" }, { action: 1 }, { action: "DELETE" }])(
    "rejects malformed action body %#",
    expectValidation
  );

  it("rejects unknown and client-owned fields", () => {
    for (const field of [
      "unknown",
      "status",
      "newStatus",
      "previousStatus",
      "adminId",
      "listingId",
      "createdAt",
      "updatedAt",
      "landlordId"
    ]) {
      expectValidation({ action: "APPROVE", [field]: 1 });
    }
  });

  it.each(["REJECT", "HIDE"] as const)("requires a trimmed nonblank reason for %s", (action) => {
    expect(validateModerationActionBody({ action, reason: "  policy  " })).toStrictEqual({
      action,
      reason: "policy"
    });
    for (const reason of [undefined, null, "", "   ", 1, "x".repeat(1_001)]) {
      expectValidation({ action, ...(reason === undefined ? {} : { reason }) });
    }
  });

  it.each(["APPROVE", "RESTORE"] as const)("accepts nullable notes but rejects supplied blank for %s", (action) => {
    expect(validateModerationActionBody({ action })).toStrictEqual({ action, reason: null });
    expect(validateModerationActionBody({ action, reason: null })).toStrictEqual({ action, reason: null });
    expect(validateModerationActionBody({ action, reason: " note " })).toStrictEqual({ action, reason: "note" });
    for (const reason of ["", "   ", 1, "x".repeat(1_001)]) expectValidation({ action, reason });
  });

  it("counts Unicode code points at the 1000/1001 boundary", () => {
    expect(validateModerationActionBody({ action: "REJECT", reason: "😀".repeat(1_000) }).reason).toHaveLength(2_000);
    expectValidation({ action: "REJECT", reason: "😀".repeat(1_001) });
  });
});

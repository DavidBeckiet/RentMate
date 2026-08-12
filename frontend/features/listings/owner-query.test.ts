import { describe, expect, it } from "vitest";
import {
  ownerListingStatuses,
  ownerListingsUrl,
  parseOwnerQuery,
  serializeOwnerQuery,
  toOwnedListingQuery,
  withOwnerPage,
  withOwnerStatus
} from "./owner-query";

describe("owner-query", () => {
  it.each(ownerListingStatuses)("parses and canonicalizes %s", (status) => {
    const parsed = parseOwnerQuery(new URLSearchParams(`status=${status.toLowerCase()}`));
    expect(parsed).toEqual({ ok: true, state: { status, page: 1 } });
    if (parsed.ok) expect(serializeOwnerQuery(parsed.state).toString()).toBe(`status=${status}`);
  });

  it("omits the all-status and default page while preserving pageSize", () => {
    const parsed = parseOwnerQuery(new URLSearchParams("pageSize=40&utm_source=test"));
    expect(parsed).toEqual({ ok: true, state: { page: 1, pageSize: 40 } });
    if (!parsed.ok) return;
    expect(ownerListingsUrl(parsed.state)).toBe("/landlord?pageSize=40");
    expect(toOwnedListingQuery(parsed.state)).toEqual({ page: 1, pageSize: 40 });
  });

  it("serializes keys in stable status/page/pageSize order", () => {
    expect(serializeOwnerQuery({ status: "APPROVED", page: 2, pageSize: 40 }).toString()).toBe(
      "status=APPROVED&page=2&pageSize=40"
    );
    expect(withOwnerPage({ status: "APPROVED", page: 1, pageSize: 40 }, 3)).toEqual({
      status: "APPROVED",
      page: 3,
      pageSize: 40
    });
  });

  it("resets page on status changes and preserves a valid pageSize", () => {
    expect(withOwnerStatus({ status: "DRAFT", page: 4, pageSize: 40 }, "HIDDEN")).toEqual({
      status: "HIDDEN",
      page: 1,
      pageSize: 40
    });
    expect(withOwnerStatus({ status: "DRAFT", page: 4 })).toEqual({ page: 1 });
  });

  it.each([
    "status=ALL",
    "status=unknown",
    "page=0",
    "page=-1",
    "page=abc",
    "pageSize=0",
    "pageSize=101",
    "status=DRAFT&status=PENDING",
    "page=1&page=2",
    "pageSize=20&pageSize=40"
  ])("rejects malformed known query %s", (query) => {
    expect(parseOwnerQuery(new URLSearchParams(query)).ok).toBe(false);
  });
});

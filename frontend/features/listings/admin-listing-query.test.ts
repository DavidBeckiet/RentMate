import { describe, expect, it } from "vitest";
import {
  adminListingsUrl,
  parseAdminListingQuery,
  toAdminListingQuery,
  withAdminListingStatus
} from "./admin-listing-query";

describe("admin listing query", () => {
  it("defaults to PENDING, ignores unknown keys, and serializes a canonical API query", () => {
    const parsed = parseAdminListingQuery(new URLSearchParams("utm=x"));
    expect(parsed).toEqual({ ok: true, state: { status: "PENDING", page: 1 } });
    if (parsed.ok) expect(toAdminListingQuery(parsed.state)).toEqual({ status: "PENDING", page: 1 });
    expect(adminListingsUrl({ status: "PENDING", page: 1 })).toBe("/admin");
  });

  it("accepts exactly six statuses and resets page when status changes", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED", "HIDDEN", "DRAFT", "INACTIVE"] as const) {
      expect(parseAdminListingQuery(new URLSearchParams(`status=${status}`))).toMatchObject({
        ok: true,
        state: { status }
      });
    }
    expect(withAdminListingStatus({ status: "PENDING", page: 4, pageSize: 40 }, "HIDDEN")).toEqual({
      status: "HIDDEN",
      page: 1,
      pageSize: 40
    });
  });

  it.each(["status=ALL", "status=PENDING&status=HIDDEN", "page=0", "page=1&page=2", "pageSize=101"])(
    "rejects malformed known state: %s",
    (query) => {
      expect(parseAdminListingQuery(new URLSearchParams(query)).ok).toBe(false);
    }
  );
});

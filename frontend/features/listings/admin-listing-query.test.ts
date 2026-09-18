import { describe, expect, it } from "vitest";
import {
  adminListingDetailUrl,
  adminListingReturnUrl,
  adminListingsUrl,
  appendAdminListingReturnQuery,
  legacyAdminListingsUrl,
  parseAdminListingQuery,
  toAdminListingQuery,
  withAdminListingStatus
} from "./admin-listing-query";

describe("admin listing query", () => {
  it("defaults to PENDING, ignores unknown keys, and serializes a canonical API query", () => {
    const parsed = parseAdminListingQuery(new URLSearchParams("utm=x"));
    expect(parsed).toEqual({ ok: true, state: { status: "PENDING", page: 1 } });
    if (parsed.ok) expect(toAdminListingQuery(parsed.state)).toEqual({ status: "PENDING", page: 1 });
    expect(adminListingsUrl({ status: "PENDING", page: 1 })).toBe("/admin/listings");
  });

  it("accepts only moderation queue statuses and resets page when status changes", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const) {
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

  it.each(["status=ALL", "status=DRAFT", "status=PENDING&status=HIDDEN", "page=0", "page=1&page=2", "pageSize=101"])(
    "rejects malformed known state: %s",
    (query) => {
      expect(parseAdminListingQuery(new URLSearchParams(query)).ok).toBe(false);
    }
  );

  it("round-trips a safe moderation queue context through listing detail URLs", () => {
    const state = { status: "APPROVED" as const, page: 3, pageSize: 40 };
    expect(adminListingDetailUrl(7, state)).toBe(
      "/admin/listings/7?returnStatus=APPROVED&returnPage=3&returnPageSize=40"
    );
    expect(adminListingReturnUrl(new URLSearchParams("returnStatus=APPROVED&returnPage=3&returnPageSize=40"))).toBe(
      "/admin/listings?status=APPROVED&page=3&pageSize=40"
    );

    const historyQuery = new URLSearchParams("historyPage=2");
    appendAdminListingReturnQuery(historyQuery, new URLSearchParams("returnStatus=HIDDEN&returnPage=4"));
    expect(historyQuery.toString()).toBe("historyPage=2&returnStatus=HIDDEN&returnPage=4");
  });

  it("falls back safely when listing return context is malformed", () => {
    expect(adminListingReturnUrl(new URLSearchParams("returnPage=0"))).toBe("/admin/listings");
    expect(adminListingReturnUrl(new URLSearchParams("returnStatus=PENDING&returnStatus=HIDDEN"))).toBe(
      "/admin/listings"
    );
  });

  it("migrates only legacy queue parameters and leaves their validation to the canonical queue", () => {
    expect(legacyAdminListingsUrl({ status: "APPROVED", page: "3", utm: "ignored" })).toBe(
      "/admin/listings?status=APPROVED&page=3"
    );
    expect(legacyAdminListingsUrl({ status: ["PENDING", "HIDDEN"] })).toBe(
      "/admin/listings?status=PENDING&status=HIDDEN"
    );
    expect(legacyAdminListingsUrl({ utm: "dashboard" })).toBeNull();
  });
});

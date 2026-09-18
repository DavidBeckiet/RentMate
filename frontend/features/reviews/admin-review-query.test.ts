import { describe, expect, it } from "vitest";
import { parseAdminReviewQueueQuery, reviewDetailUrl, reviewQueueUrl, reviewReturnUrl } from "./admin-review-query";

describe("admin review queue navigation", () => {
  it.each([1, 100, 101, 999])("keeps page %s", (page) => {
    expect(parseAdminReviewQueueQuery(new URLSearchParams(`page=${page}`)).page).toBe(page);
  });

  it.each(["0", "-1", "1.5", "NaN", "invalid", ""])("falls back for invalid page %s", (page) => {
    expect(parseAdminReviewQueueQuery(new URLSearchParams(`page=${page}`)).page).toBe(1);
  });

  it("limits pageSize while retaining a large page", () => {
    expect(parseAdminReviewQueueQuery(new URLSearchParams("page=999&pageSize=101"))).toEqual({
      status: "PENDING",
      page: 999,
      pageSize: 20
    });
  });

  it("resets page and preserves a validated return context", () => {
    const state = parseAdminReviewQueueQuery(new URLSearchParams("status=APPROVED&page=8&pageSize=40"));
    expect(reviewQueueUrl({ ...state, status: "REJECTED", page: 1 })).toBe(
      "/admin/reviews?status=REJECTED&pageSize=40"
    );
    expect(reviewDetailUrl(17, state)).toBe("/admin/reviews/17?returnStatus=APPROVED&returnPage=8&returnPageSize=40");
    expect(reviewReturnUrl(new URLSearchParams("returnStatus=APPROVED&returnPage=101&returnPageSize=40"))).toBe(
      "/admin/reviews?status=APPROVED&page=101&pageSize=40"
    );
    expect(reviewReturnUrl(new URLSearchParams("returnStatus=NOPE&returnUrl=https://unsafe.test"))).toBe(
      "/admin/reviews"
    );
  });
});

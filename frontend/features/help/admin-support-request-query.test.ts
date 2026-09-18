import { describe, expect, it } from "vitest";
import {
  parseSupportRequestQueueQuery,
  supportRequestDetailUrl,
  supportRequestQueueUrl,
  supportRequestReturnUrl
} from "./admin-support-request-query";

describe("support request queue navigation", () => {
  it.each([1, 100, 101, 999])("preserves valid page %s", (page) => {
    expect(parseSupportRequestQueueQuery(new URLSearchParams(`page=${page}`))).toEqual({
      status: "OPEN",
      page,
      pageSize: 20
    });
  });

  it.each(["0", "-1", "1.5", "NaN", "abc", ""])("falls back for invalid page %s", (page) => {
    expect(parseSupportRequestQueueQuery(new URLSearchParams(`page=${page}`)).page).toBe(1);
  });

  it("keeps the page-size limit while allowing a large page number", () => {
    expect(parseSupportRequestQueueQuery(new URLSearchParams("page=999&pageSize=101"))).toEqual({
      status: "OPEN",
      page: 999,
      pageSize: 20
    });
  });

  it("preserves allowlisted queue context for a case detail and return link", () => {
    const state = parseSupportRequestQueueQuery(new URLSearchParams("status=IN_PROGRESS&page=3&pageSize=40"));
    expect(supportRequestDetailUrl(17, state)).toBe(
      "/admin/support-requests/17?returnStatus=IN_PROGRESS&returnPage=3&returnPageSize=40"
    );
    expect(
      supportRequestReturnUrl(new URLSearchParams("returnStatus=IN_PROGRESS&returnPage=3&returnPageSize=40"))
    ).toBe("/admin/support-requests?status=IN_PROGRESS&page=3&pageSize=40");
  });

  it("discards unsupported queue and return parameters", () => {
    expect(parseSupportRequestQueueQuery(new URLSearchParams("status=SAFETY&page=-1&pageSize=999"))).toEqual({
      status: "OPEN",
      page: 1,
      pageSize: 20
    });
    expect(supportRequestReturnUrl(new URLSearchParams("returnUrl=https://unsafe.test&returnStatus=NOPE"))).toBe(
      "/admin/support-requests"
    );
  });

  it("builds page 101 when moving forward from page 100", () => {
    const state = parseSupportRequestQueueQuery(new URLSearchParams("page=100"));
    expect(supportRequestQueueUrl({ ...state, page: state.page + 1 })).toBe("/admin/support-requests?page=101");
  });
});

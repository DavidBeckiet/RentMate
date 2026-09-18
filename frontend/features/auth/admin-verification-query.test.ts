import { describe, expect, it } from "vitest";
import {
  adminVerificationDetailUrl,
  adminVerificationReturnUrl,
  adminVerificationsUrl,
  parseAdminVerificationQuery,
  toVerificationQuery,
  withAdminVerificationPage,
  withAdminVerificationStatus
} from "./admin-verification-query";

describe("admin verification query", () => {
  it("uses safe queue defaults and produces the API query", () => {
    const parsed = parseAdminVerificationQuery(new URLSearchParams());
    expect(parsed).toEqual({ ok: true, state: { status: "PENDING", page: 1, pageSize: 20 } });
    if (parsed.ok) expect(toVerificationQuery(parsed.state)).toEqual(parsed.state);
    expect(adminVerificationsUrl({ status: "PENDING", page: 1, pageSize: 20 })).toBe("/admin/verifications");
  });

  it("round-trips status, page and page size while resetting page on status changes", () => {
    const parsed = parseAdminVerificationQuery(new URLSearchParams("status=APPROVED&page=3&pageSize=40"));
    expect(parsed).toEqual({ ok: true, state: { status: "APPROVED", page: 3, pageSize: 40 } });
    if (!parsed.ok) return;
    expect(adminVerificationsUrl(parsed.state)).toBe("/admin/verifications?status=APPROVED&page=3&pageSize=40");
    expect(withAdminVerificationStatus(parsed.state, "REJECTED")).toEqual({
      status: "REJECTED",
      page: 1,
      pageSize: 40
    });
    expect(withAdminVerificationPage(parsed.state, 4)).toEqual({ status: "APPROVED", page: 4, pageSize: 40 });
    expect(adminVerificationDetailUrl(9, parsed.state)).toBe(
      "/admin/verifications/9?returnStatus=APPROVED&returnPage=3&returnPageSize=40"
    );
    expect(
      adminVerificationReturnUrl(new URLSearchParams("returnStatus=APPROVED&returnPage=3&returnPageSize=40"))
    ).toBe("/admin/verifications?status=APPROVED&page=3&pageSize=40");
  });

  it.each([
    "status=UNKNOWN",
    "status=PENDING&status=APPROVED",
    "page=0",
    "page=1&page=2",
    "pageSize=0",
    "pageSize=101"
  ])("rejects malformed queue state: %s", (query) => {
    expect(parseAdminVerificationQuery(new URLSearchParams(query)).ok).toBe(false);
  });

  it("falls back safely when return context is absent or malformed", () => {
    expect(adminVerificationReturnUrl(new URLSearchParams())).toBe("/admin/verifications");
    expect(adminVerificationReturnUrl(new URLSearchParams("returnPage=0"))).toBe("/admin/verifications");
    expect(adminVerificationReturnUrl(new URLSearchParams("returnStatus=PENDING&returnStatus=APPROVED"))).toBe(
      "/admin/verifications"
    );
  });
});

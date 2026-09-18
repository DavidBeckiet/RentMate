import { describe, expect, it } from "vitest";
import {
  adminUserDetailUrl,
  adminUserReturnUrl,
  adminUsersUrl,
  parseAdminUserQuery,
  toAdminUserQuery,
  withAdminUserFilters,
  withAdminUserSearch
} from "./admin-user-query";

describe("admin user query", () => {
  it("normalizes search and sends supported directory state to the API", () => {
    const parsed = parseAdminUserQuery(
      new URLSearchParams("q=%20Minh%20Anh%20&role=landlord&isActive=false&page=2&pageSize=40")
    );
    expect(parsed).toEqual({
      ok: true,
      state: { q: "Minh Anh", role: "LANDLORD", isActive: false, page: 2, pageSize: 40 }
    });
    if (parsed.ok) expect(toAdminUserQuery(parsed.state)).toEqual(parsed.state);
  });

  it("treats whitespace search as empty and resets page on search or filter changes", () => {
    expect(parseAdminUserQuery(new URLSearchParams("q=%20%20"))).toEqual({ ok: true, state: { page: 1 } });
    expect(withAdminUserSearch({ role: "TENANT", page: 4 }, "  42  ")).toEqual({
      q: "42",
      role: "TENANT",
      page: 1
    });
    expect(withAdminUserFilters({ q: "minh", role: "TENANT", page: 3 }, { role: "ADMIN" })).toEqual({
      q: "minh",
      role: "ADMIN",
      page: 1
    });
  });

  it("builds detail and return links from allowlisted directory context", () => {
    const state = { q: "minh@example.com", role: "TENANT" as const, isActive: true, page: 3 };
    expect(adminUserDetailUrl(42, state)).toBe("/admin/users/42?q=minh%40example.com&role=TENANT&isActive=true&page=3");
    expect(adminUserReturnUrl(new URLSearchParams("q=minh&role=TENANT&page=3&returnTo=https://evil.test"))).toBe(
      "/admin/users?q=minh&role=TENANT&page=3"
    );
    expect(adminUserReturnUrl(new URLSearchParams("role=ALL&returnTo=/admin"))).toBe("/admin/users");
    expect(adminUsersUrl({ page: 1 })).toBe("/admin/users");
  });

  it.each([
    "q=one&q=two",
    `q=${"x".repeat(321)}`,
    "role=ALL",
    "role=TENANT&role=ADMIN",
    "isActive=1",
    "page=-1",
    "pageSize=101"
  ])("rejects malformed known state: %s", (query) => {
    expect(parseAdminUserQuery(new URLSearchParams(query)).ok).toBe(false);
  });
});

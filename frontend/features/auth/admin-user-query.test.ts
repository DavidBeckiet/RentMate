import { describe, expect, it } from "vitest";
import { adminUsersUrl, parseAdminUserQuery, toAdminUserQuery, withAdminUserFilters } from "./admin-user-query";

describe("admin user query", () => {
  it("omits absent filters instead of serializing ALL", () => {
    const parsed = parseAdminUserQuery(new URLSearchParams("tracking=x"));
    expect(parsed).toEqual({ ok: true, state: { page: 1 } });
    if (parsed.ok) expect(toAdminUserQuery(parsed.state)).toEqual({ page: 1 });
    expect(adminUsersUrl({ page: 1 })).toBe("/admin/users");
  });

  it("parses filters and resets page while preserving page size", () => {
    expect(parseAdminUserQuery(new URLSearchParams("role=landlord&isActive=false&page=2&pageSize=40"))).toEqual({
      ok: true,
      state: { role: "LANDLORD", isActive: false, page: 2, pageSize: 40 }
    });
    expect(withAdminUserFilters({ role: "TENANT", page: 3, pageSize: 40 }, { role: "ADMIN", isActive: true })).toEqual({
      role: "ADMIN",
      isActive: true,
      page: 1,
      pageSize: 40
    });
  });

  it.each([
    "role=ALL",
    "role=TENANT&role=ADMIN",
    "isActive=1",
    "isActive=true&isActive=false",
    "page=-1",
    "pageSize=101"
  ])("rejects malformed known state: %s", (query) => {
    expect(parseAdminUserQuery(new URLSearchParams(query)).ok).toBe(false);
  });
});

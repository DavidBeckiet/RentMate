import { describe, expect, it } from "vitest";
import {
  adminNavigationItems,
  consumerNavigationItems,
  isNavigationItemActive,
  landlordNavigationItems,
  resolveShellKind
} from "./navigation-model";

describe("actor-aware navigation model", () => {
  it("uses only existing route URLs for every actor model", () => {
    const existingRoutes = new Set([
      "/",
      "/search",
      "/near-me",
      "/recently-viewed",
      "/favorites",
      "/inquiries",
      "/notifications",
      "/roommates",
      "/help",
      "/landlord",
      "/landlord/inquiries",
      "/landlord/leads",
      "/landlord/analytics",
      "/landlord/profile",
      "/admin",
      "/admin/users",
      "/admin/reports",
      "/admin/roommate-reports",
      "/admin/contact-reports",
      "/admin/support-requests",
      "/admin/reviews",
      "/admin/review-reports",
      "/admin/verifications"
    ]);

    for (const item of [
      ...consumerNavigationItems("tenant"),
      ...consumerNavigationItems("landlord"),
      ...consumerNavigationItems("admin"),
      ...consumerNavigationItems("anonymous"),
      ...landlordNavigationItems,
      ...adminNavigationItems
    ]) {
      expect(existingRoutes.has(item.href)).toBe(true);
    }
  });

  it("keeps home in the shared header and reserves notifications for the account area", () => {
    for (const actor of ["anonymous", "tenant", "landlord", "admin"] as const) {
      expect(consumerNavigationItems(actor).some((item) => item.key === "home")).toBe(true);
      expect(consumerNavigationItems(actor).some((item) => item.key === "notifications")).toBe(false);
    }
  });

  it("keeps public help reachable outside the primary discovery navigation", () => {
    expect(consumerNavigationItems("anonymous").some((item) => item.key === "help")).toBe(false);
  });

  it("resolves route-owned, shared, auth, and wrong-role shells without treating role UX as authorization", () => {
    expect(resolveShellKind("/login", "anonymous")).toBe("auth");
    expect(resolveShellKind("/register", "anonymous")).toBe("auth");
    expect(resolveShellKind("/landlord", "landlord")).toBe("landlord");
    expect(resolveShellKind("/landlord", "loading")).toBe("landlord");
    expect(resolveShellKind("/landlord", "tenant")).toBe("restricted");
    expect(resolveShellKind("/admin/users", "admin")).toBe("admin");
    expect(resolveShellKind("/inquiries/42", "landlord")).toBe("landlord");
    expect(resolveShellKind("/inquiries/42", "tenant")).toBe("consumer");
    expect(resolveShellKind("/search", "admin")).toBe("consumer");
  });

  it("marks nested detail routes through explicit active patterns", () => {
    const landlordListings = landlordNavigationItems.find((item) => item.key === "landlord-listings");
    const adminListings = adminNavigationItems.find((item) => item.key === "admin-listings");
    expect(landlordListings && isNavigationItemActive(landlordListings, "/landlord/listings/42")).toBe(true);
    expect(adminListings && isNavigationItemActive(adminListings, "/admin/listings/42")).toBe(true);
  });
});

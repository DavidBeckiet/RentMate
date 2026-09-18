import { describe, expect, it } from "vitest";
import {
  adminNavigationItems,
  adminOperationsNavigationItems,
  adminReportNavigationItems,
  adminSupportNavigationItems,
  consumerNavigationItems,
  isNavigationItemActive,
  landlordNavigationItems,
  roommateManagementItems,
  roommateNavigationItems,
  resolveShellKind,
  tenantSecondaryItems
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
      "/roommates/my-request",
      "/roommates/interests",
      "/roommates/connection",
      "/roommates/messages",
      "/roommates/profile",
      "/roommates/blocked",
      "/help",
      "/landlord",
      "/landlord/inquiries",
      "/landlord/leads",
      "/landlord/analytics",
      "/landlord/profile",
      "/admin",
      "/admin/listings",
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
      ...roommateNavigationItems,
      ...roommateManagementItems,
      ...landlordNavigationItems,
      ...adminNavigationItems
    ]) {
      expect(existingRoutes.has(item.href)).toBe(true);
    }
  });

  it("keeps discovery primary for visitors while giving landlords a focused management entry", () => {
    for (const actor of ["anonymous", "tenant", "admin"] as const) {
      expect(consumerNavigationItems(actor).some((item) => item.key === "home")).toBe(true);
      expect(consumerNavigationItems(actor).some((item) => item.key === "notifications")).toBe(false);
    }

    expect(consumerNavigationItems("landlord").map((item) => item.key)).toEqual(["landlord-workspace"]);
    expect(consumerNavigationItems("landlord")[0]).toMatchObject({
      label: "Quản lý cho thuê",
      href: "/landlord"
    });
  });

  it("keeps tenant primary navigation focused on the main journeys", () => {
    expect(consumerNavigationItems("tenant").map((item) => item.key)).toEqual([
      "home",
      "search",
      "near-me",
      "roommates",
      "inquiries"
    ]);
    expect(tenantSecondaryItems.map((item) => item.key)).toEqual([
      "favorites",
      "recently-viewed",
      "saved-searches",
      "compare"
    ]);
  });

  it("keeps global tenant navigation stable inside feature workspaces", () => {
    expect(consumerNavigationItems("tenant").map((item) => item.key)).toEqual([
      "home",
      "search",
      "near-me",
      "roommates",
      "inquiries"
    ]);
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
    const adminOverview = adminNavigationItems.find((item) => item.key === "admin-overview");
    expect(landlordListings && isNavigationItemActive(landlordListings, "/landlord/listings/42")).toBe(true);
    expect(adminListings && isNavigationItemActive(adminListings, "/admin/listings/42")).toBe(true);
    expect(adminListings && isNavigationItemActive(adminListings, "/admin")).toBe(false);
    expect(adminOverview && isNavigationItemActive(adminOverview, "/admin")).toBe(true);
  });

  it("groups every admin route once with Vietnamese report labels", () => {
    const groupedItems = [
      ...adminOperationsNavigationItems,
      ...adminSupportNavigationItems,
      ...adminReportNavigationItems
    ];
    expect(groupedItems).toEqual(adminNavigationItems);
    expect(new Set(groupedItems.map((item) => item.href)).size).toBe(groupedItems.length);
    expect(adminReportNavigationItems.map((item) => item.label)).toEqual(["Tin đăng", "Liên hệ", "Ở ghép", "Đánh giá"]);
    expect(adminOperationsNavigationItems.map((item) => item.label)).toEqual([
      "Tổng quan",
      "Kiểm duyệt tin",
      "Người dùng",
      "Xác minh chủ trọ"
    ]);
  });
});

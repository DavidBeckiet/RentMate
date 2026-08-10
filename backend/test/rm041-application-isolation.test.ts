import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const listingsRoot = path.join(sourceRoot, "modules", "listings");

describe("RM-041 application isolation", () => {
  it("keeps four business modules and exactly 67 listings production files", async () => {
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(71);
    expect(
      files.filter((name) => name.startsWith("admin-listing") || name === "moderation-history-mapper.ts")
    ).toStrictEqual([
      "admin-listing-detail-mapper.ts",
      "admin-listing-read-controller.ts",
      "admin-listing-read-repository.ts",
      "admin-listing-read-service.ts",
      "admin-listing-read-validation.ts",
      "admin-listing-summary-mapper.ts",
      "moderation-history-mapper.ts"
    ]);
  });

  it("registers exactly the three RM-041 GET routes and no later admin endpoints", async () => {
    const routeFiles = ["auth", "favorites", "listings", "users"].map((module) =>
      path.join(sourceRoot, "modules", module, "routes.ts")
    );
    const sources = await Promise.all(routeFiles.map((file) => readFile(file, "utf8")));
    const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const all = sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => [match[1], match[2]]));
    const listings = [...sources[2]!.matchAll(pattern)].map((match) => [match[1], match[2]]);
    expect(all).toHaveLength(31);
    expect(listings).toHaveLength(20);
    expect(listings.filter((route) => route[1] === "/admin/listings")).toStrictEqual([["get", "/admin/listings"]]);
    expect(listings.filter((route) => route[1] === "/admin/listings/:listingId")).toStrictEqual([
      ["get", "/admin/listings/:listingId"]
    ]);
    expect(listings.filter((route) => route[1] === "/admin/listings/:listingId/moderation-actions")).toStrictEqual([
      ["post", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings/:listingId/moderation-actions"]
    ]);
    expect(
      all.filter((route) => route[0] === "post" && route[1] === "/admin/listings/:listingId/moderation-actions")
    ).toHaveLength(1);
    expect(
      all.filter(([, route]) => route === "/admin/users" || route === "/admin/users/:userId/activation")
    ).toStrictEqual([
      ["get", "/admin/users"],
      ["patch", "/admin/users/:userId/activation"]
    ]);
  });

  it("keeps RM-041 read-only, provider-free, and outside frozen/protected paths", async () => {
    const files = (await readdir(listingsRoot)).filter(
      (name) => name.startsWith("admin-listing") || name === "moderation-history-mapper.ts"
    );
    const combined = (await Promise.all(files.map((name) => readFile(path.join(listingsRoot, name), "utf8")))).join(
      "\n"
    );
    expect(combined).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|FOR UPDATE|BEGIN|COMMIT|ROLLBACK)\b/i);
    expect(combined).not.toMatch(/cloudinary_public_id|password_hash|NominatimClient|CloudinaryClient/);
    expect(combined).not.toMatch(/APPROVE|RESTORE|createModerationAction|activation/i);
  });
});

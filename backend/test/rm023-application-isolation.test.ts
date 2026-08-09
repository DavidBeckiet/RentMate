import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const listings = path.join(root, "src/modules/listings");
describe("RM-023 application isolation", () => {
  it("keeps the exact production inventory and exactly one PATCH route", async () => {
    expect((await readdir(listings)).sort()).toStrictEqual([
      "current-moderation-reason-repository.ts",
      "current-moderation-reason.ts",
      "geocoding-controller.ts",
      "geocoding-service.ts",
      "geocoding-validation.ts",
      "listing-completeness.ts",
      "listing-create-controller.ts",
      "listing-create-repository.ts",
      "listing-create-service.ts",
      "listing-create-validation.ts",
      "listing-delete-cleanup.ts",
      "listing-delete-cloudinary-cleanup.ts",
      "listing-delete-controller.ts",
      "listing-delete-repository.ts",
      "listing-delete-service.ts",
      "listing-image-delete-controller.ts",
      "listing-image-delete-repository.ts",
      "listing-image-delete-service.ts",
      "listing-image-order-controller.ts",
      "listing-image-order-repository.ts",
      "listing-image-order-service.ts",
      "listing-image-order-validation.ts",
      "listing-image-upload-controller.ts",
      "listing-image-upload-multipart.ts",
      "listing-image-upload-repository.ts",
      "listing-image-upload-service.ts",
      "listing-image-upload-validation.ts",
      "listing-lifecycle-action-controller.ts",
      "listing-lifecycle-action-repository.ts",
      "listing-lifecycle-action-service.ts",
      "listing-lifecycle-policy.ts",
      "listing-submit-controller.ts",
      "listing-submit-repository.ts",
      "listing-submit-service.ts",
      "listing-update-controller.ts",
      "listing-update-repository.ts",
      "listing-update-service.ts",
      "listing-update-state.ts",
      "listing-update-validation.ts",
      "lookup-controller.ts",
      "lookup-mapper.ts",
      "lookup-repository.ts",
      "owner-image-mapper.ts",
      "owner-listing-mapper.ts",
      "owner-listing-read-controller.ts",
      "owner-listing-read-repository.ts",
      "owner-listing-read-service.ts",
      "owner-listing-read-validation.ts",
      "owner-listing-summary-mapper.ts",
      "public-listing-search-controller.ts",
      "public-listing-search-repository.ts",
      "public-listing-search-service.ts",
      "public-listing-search-validation.ts",
      "public-listing-summary-mapper.ts",
      "routes.ts"
    ]);
    const routes = await readFile(path.join(listings, "routes.ts"), "utf8");
    expect([...routes.matchAll(/router\.patch\(/g)]).toHaveLength(1);
    expect([
      ...routes.matchAll(/router\.put\([\s\S]*?"\/landlord\/listings\/:listingId\/images\/order"/g)
    ]).toHaveLength(1);
    expect(routes).toContain('"/landlord/listings/:listingId"');
    expect(routes.match(/router\.get\("\/listings"/g)).toHaveLength(1);
    expect(routes).not.toMatch(/favorite|admin/i);
  });
  it("limits writes to listing content and listing amenities", async () => {
    const repository = await readFile(path.join(listings, "listing-update-repository.ts"), "utf8");
    expect(repository).toMatch(/UPDATE listings[\s\S]*updated_at = CURRENT_TIMESTAMP/);
    expect(repository).toMatch(/DELETE FROM listing_amenities/);
    expect(repository).toMatch(/INSERT INTO listing_amenities/);
    expect(repository).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)[\s\S]{0,30}(?:moderation_history|listing_images|favorites|users)/i
    );
  });
  it("adds no migration, dependency, shared lifecycle framework, or later provider work", async () => {
    const migrations = (await readdir(path.join(root, "migrations"))).filter((file) => file.endsWith(".sql")).sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cloudinary: "^2.10.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      multer: "^2.2.0",
      pg: "8.16.0"
    });
    const combined = (
      await Promise.all((await readdir(listings)).map((file) => readFile(path.join(listings, file), "utf8")))
    ).join("\n");
    expect(combined).not.toMatch(
      /BaseRepository|GenericRepository|module.?registry|route.?discovery|bulk.?upload|image.?replacement/i
    );
  });
  it("delegates the PATCH status result to the focused shared lifecycle policy", async () => {
    const state = await readFile(path.join(listings, "listing-update-state.ts"), "utf8");
    const policy = await readFile(path.join(listings, "listing-lifecycle-policy.ts"), "utf8");
    expect(state).toContain("resolveListingStatusAfterMutation(");
    expect(state).not.toMatch(/Readonly<Record<ListingStatus, ListingStatus>>|REJECTED:\s*"DRAFT"/);
    expect(policy).toContain('case "SIGNIFICANT_CONTENT_CHANGE"');
    expect(policy).not.toMatch(/submit|deactivate|reactivate|moderation|image/i);
  });
});

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const listingsRoot = path.join(backendRoot, "src/modules/listings");

describe("RM-026 application isolation", () => {
  it("keeps the exact 55-file listings inventory and two explicit availability routes", async () => {
    expect((await readdir(listingsRoot)).sort()).toStrictEqual([
      "admin-listing-detail-mapper.ts",
      "admin-listing-read-controller.ts",
      "admin-listing-read-repository.ts",
      "admin-listing-read-service.ts",
      "admin-listing-read-validation.ts",
      "admin-listing-summary-mapper.ts",
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
      "moderation-action-controller.ts",
      "moderation-action-repository.ts",
      "moderation-action-service.ts",
      "moderation-action-validation.ts",
      "moderation-history-mapper.ts",
      "owner-image-mapper.ts",
      "owner-listing-mapper.ts",
      "owner-listing-read-controller.ts",
      "owner-listing-read-repository.ts",
      "owner-listing-read-service.ts",
      "owner-listing-read-validation.ts",
      "owner-listing-summary-mapper.ts",
      "public-listing-detail-controller.ts",
      "public-listing-detail-mapper.ts",
      "public-listing-detail-repository.ts",
      "public-listing-detail-service.ts",
      "public-listing-search-bounding-box.ts",
      "public-listing-search-controller.ts",
      "public-listing-search-repository.ts",
      "public-listing-search-service.ts",
      "public-listing-search-validation.ts",
      "public-listing-summary-mapper.ts",
      "routes.ts"
    ]);
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toStrictEqual([
      ["get", "/lookups/property-types"],
      ["get", "/lookups/amenities"],
      ["get", "/listings"],
      ["get", "/listings/:listingId"],
      ["post", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings"],
      ["get", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings/:listingId"],
      ["post", "/landlord/listings"],
      ["get", "/landlord/listings"],
      ["get", "/landlord/listings/:listingId"],
      ["patch", "/landlord/listings/:listingId"],
      ["post", "/landlord/listings/:listingId/submit"],
      ["post", "/landlord/listings/:listingId/deactivate"],
      ["post", "/landlord/listings/:listingId/reactivate"],
      ["delete", "/landlord/listings/:listingId"],
      ["post", "/landlord/listings/:listingId/images"],
      ["delete", "/landlord/listings/:listingId/images/:imageId"],
      ["put", "/landlord/listings/:listingId/images/order"],
      ["post", "/geocoding/forward"]
    ]);
    expect(routes.match(/"\/landlord\/listings\/:listingId\/deactivate"/g)).toHaveLength(1);
    expect(routes.match(/"\/landlord\/listings\/:listingId\/reactivate"/g)).toHaveLength(1);
    expect(routes).not.toMatch(/favorite/i);
    expect(routes.match(/router\.post\(\s*"\/admin\/listings\/:listingId\/moderation-actions"/g)).toHaveLength(1);
    expect(routes).not.toMatch(/\/admin\/users/i);
  });

  it("keeps each availability write fixed, conditional, and bounded", async () => {
    const repository = await readFile(path.join(listingsRoot, "listing-lifecycle-action-repository.ts"), "utf8");
    expect(repository).toContain("SELECT l.id, l.status FROM listings AS l");
    expect(repository).toContain("l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l");
    expect(repository).toContain("SET status = $1::listing_status, updated_at = CURRENT_TIMESTAMP");
    expect(repository).toContain("id = $2 AND landlord_id = $3 AND status = $4::listing_status");
    expect(repository.match(/UPDATE listings/g)).toHaveLength(1);
    expect(repository).not.toMatch(/INSERT INTO|DELETE FROM|moderation_history|listing_images|listing_amenities/i);
  });

  it("uses one transaction and the existing owner-detail projection without eligibility or reason queries", async () => {
    const service = await readFile(path.join(listingsRoot, "listing-lifecycle-action-service.ts"), "utf8");
    const controller = await readFile(path.join(listingsRoot, "listing-lifecycle-action-controller.ts"), "utf8");
    expect(service).toContain("transactionRunner(async (executor)");
    expect(service).toContain("createOwnerListingReadService(ownerReadFactory(executor))");
    expect(service).toContain('new ApplicationError("CONCURRENT_MODIFICATION"');
    expect(service).not.toMatch(/listing-completeness|listing-submit|current-moderation-reason|moderation_history/i);
    expect(controller).toContain("validateAbsentBody(request.body)");
    expect(controller).not.toMatch(/status|transition|generic/i);
  });

  it("keeps availability actions separate from submit policy with the frozen schema and dependencies", async () => {
    const policy = await readFile(path.join(listingsRoot, "listing-lifecycle-policy.ts"), "utf8");
    expect(policy).not.toMatch(/submit|deactivate|reactivate|admin|moderation|image|transaction|sql/i);
    const migrations = (await readdir(path.join(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    const packageJson = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
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
  });
});

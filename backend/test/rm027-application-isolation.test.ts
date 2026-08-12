import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const listingsRoot = path.join(backendRoot, "src/modules/listings");

describe("RM-027 application isolation", () => {
  it("keeps the exact 55-file listings inventory and fifteen explicit routes", async () => {
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
    expect(routes.match(/router\.delete/g)).toHaveLength(2);
    expect(routes).not.toMatch(/favorite/i);
    expect(routes.match(/router\.post\(\s*"\/admin\/listings\/:listingId\/moderation-actions"/g)).toHaveLength(1);
    expect(routes).not.toMatch(/\/admin\/users/i);
  });

  it("keeps delete persistence owner-scoped, transaction-safe, and database-cascade-only", async () => {
    const repository = await readFile(path.join(listingsRoot, "listing-delete-repository.ts"), "utf8");
    const normalized = repository.replace(/\s+/g, " ");
    expect(normalized).toContain(
      "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l"
    );
    expect(normalized).toContain(
      "SELECT EXISTS (SELECT 1 FROM moderation_history WHERE listing_id = $1) AS has_moderation_history"
    );
    expect(normalized).toContain(
      "SELECT cloudinary_public_id FROM listing_images WHERE listing_id = $1 ORDER BY id ASC"
    );
    expect(normalized).toContain("DELETE FROM listings WHERE id = $1 AND landlord_id = $2 AND status = 'DRAFT'");
    expect(repository.match(/DELETE FROM/g)).toHaveLength(1);
    expect(repository).not.toMatch(/DELETE FROM (?:listing_images|listing_amenities|favorites|moderation_history)/i);
    expect(repository).not.toMatch(/UPDATE listings|INSERT INTO|updated_at|CURRENT_TIMESTAMP/i);
  });

  it("hands cleanup off once after the transaction and keeps provider work out of RM-027", async () => {
    const service = await readFile(path.join(listingsRoot, "listing-delete-service.ts"), "utf8");
    const cleanup = await readFile(path.join(listingsRoot, "listing-delete-cleanup.ts"), "utf8");
    const transactionIndex = service.indexOf("await dependencies.transactionRunner");
    const handoffIndex = service.indexOf("await dependencies.cleanupHandoff.afterCommittedDelete");
    expect(transactionIndex).toBeGreaterThan(-1);
    expect(handoffIndex).toBeGreaterThan(transactionIndex);
    expect(service.match(/afterCommittedDelete/g)).toHaveLength(1);
    expect(service).toContain("Object.freeze([...(await repository.findCloudinaryPublicIds(listingId))])");
    expect(service).toContain("Listing delete cleanup handoff failed after database commit.");
    expect(service).toContain("listingId,");
    expect(service).toContain("assetCount: cloudinaryPublicIds.length");
    expect(service).toContain('errorType: error instanceof Error ? error.name : "UnknownError"');
    expect(service).not.toMatch(/secure_url|password|cookie|jwt|token/i);
    expect(cleanup).toContain("noOpListingDeleteCleanupHandoff");
    expect(cleanup).not.toMatch(/fetch|axios|https?:|cloudinary\.v2|destroy\(|upload\(|queue|worker/i);
  });

  it("preserves controller boundaries and frozen error contracts", async () => {
    const controller = await readFile(path.join(listingsRoot, "listing-delete-controller.ts"), "utf8");
    const service = await readFile(path.join(listingsRoot, "listing-delete-service.ts"), "utf8");
    expect(controller).toContain('parsePathId(value, "listingId")');
    expect(controller).toContain("validateQueryKeys(request.query, [])");
    expect(controller).toContain("validateAbsentBody(request.body)");
    expect(controller).toContain("sendNoContent(response)");
    expect(service).toContain('new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage)');
    expect(service).toContain('new ApplicationError("LISTING_DELETE_NOT_ALLOWED", deleteNotAllowedMessage)');
    expect(service).toContain('new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage)');
    expect(service).not.toMatch(/refresh|session table|RM-028|RM-029/i);
  });

  it("keeps the frozen schema and backend dependency inventory", async () => {
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

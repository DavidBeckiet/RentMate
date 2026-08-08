import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.join(backendRoot, "src/modules/listings");

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

async function source(filename: string): Promise<string> {
  return readFile(path.join(listingsRoot, filename), "utf8");
}

describe("RM-030 application isolation", () => {
  it("contains exactly 50 listings files and fourteen routes through V1-22", async () => {
    expect((await readdir(listingsRoot)).sort()).toStrictEqual([
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
      "routes.ts"
    ]);
    const routes = await source("routes.ts");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toStrictEqual([
      ["get", "/lookups/property-types"],
      ["get", "/lookups/amenities"],
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
    expect(registrations.filter(([, route]) => route === "/landlord/listings/:listingId/images/:imageId")).toHaveLength(
      1
    );
    expect(registrations.filter(([, route]) => route === "/landlord/listings/:listingId/images/order")).toHaveLength(1);
    expect(routes).not.toMatch(/replace|bulk|favorite|admin/i);
  });

  it("keeps deletion transaction-bound, significant, nested, and free of reorder or history writes", async () => {
    const controller = await source("listing-image-delete-controller.ts");
    const repository = await source("listing-image-delete-repository.ts");
    const service = await source("listing-image-delete-service.ts");
    const combined = [controller, repository, service].join("\n");
    expect(repository.replace(/\s+/g, " ")).toContain(
      "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l"
    );
    expect(repository).toContain(
      "SELECT id, cloudinary_public_id, display_order FROM listing_images WHERE listing_id = $1"
    );
    expect(repository).toContain("DELETE FROM listing_images WHERE id = $1 AND listing_id = $2");
    expect(repository).toContain("updated_at = CURRENT_TIMESTAMP");
    expect(service).toContain('resolveListingStatusAfterMutation(listing.status, "SIGNIFICANT_CONTENT_CHANGE")');
    expect(service.indexOf("transactionRunner")).toBeLessThan(service.indexOf("cloudinaryClient.removeImage"));
    expect(repository).not.toMatch(/UPDATE listing_images|SET CONSTRAINTS|moderation_history|BEGIN|COMMIT/i);
    expect(combined).not.toMatch(/from "cloudinary"|cloudinary\.v2|retry.?loop|queue|worker|outbox|replace.?image/i);
    expect(controller).not.toMatch(/cloudinary|publicId|displayOrder|status/i);
  });

  it("reuses the existing provider and lifecycle seams without changing RM-029 or RM-027 production", async () => {
    expect((await readdir(path.join(backendRoot, "src/integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    const composition = await readFile(path.join(backendRoot, "src/server-composition.ts"), "utf8");
    expect(composition).toContain("createListingImageDeleteService");
    expect(composition).toContain("cloudinaryClient");
    expect(
      gitDiff(
        "backend/src/integrations/cloudinary.client.ts",
        "backend/src/modules/listings/listing-lifecycle-policy.ts",
        "backend/src/modules/listings/listing-image-upload-controller.ts",
        "backend/src/modules/listings/listing-image-upload-multipart.ts",
        "backend/src/modules/listings/listing-image-upload-repository.ts",
        "backend/src/modules/listings/listing-image-upload-service.ts",
        "backend/src/modules/listings/listing-image-upload-validation.ts",
        "backend/src/modules/listings/listing-delete-controller.ts",
        "backend/src/modules/listings/listing-delete-repository.ts",
        "backend/src/modules/listings/listing-delete-service.ts",
        "backend/src/modules/listings/listing-delete-cleanup.ts",
        "backend/src/modules/listings/listing-delete-cloudinary-cleanup.ts"
      )
    ).toBe("");
  });

  it("adds no dependency, lockfile, schema, config, fixture, frontend, or frozen-document change", async () => {
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
    expect(
      gitDiff(
        ".env.example",
        "backend/package-lock.json",
        "package-lock.json",
        "backend/src/app.ts",
        "backend/src/config/env.ts",
        "backend/src/db",
        "backend/migrations",
        "backend/test/helpers/listings-phase4-fixture.ts",
        "backend/test/support/test-database.ts",
        "frontend",
        "docs",
        "AGENTS.md"
      )
    ).toBe("");
    const migrations = (await readdir(path.join(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
  });
});

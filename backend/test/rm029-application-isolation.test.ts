import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const listingsRoot = path.join(backendRoot, "src/modules/listings");

async function source(filename: string): Promise<string> {
  return readFile(path.join(listingsRoot, filename), "utf8");
}

describe("RM-029 application isolation", () => {
  it("contains exactly 55 listings files, two integration clients, and fifteen routes", async () => {
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
    expect((await readdir(path.join(backendRoot, "src/integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    const routes = await source("routes.ts");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toHaveLength(20);
    expect(registrations.filter(([, route]) => route === "/listings")).toStrictEqual([["get", "/listings"]]);
    expect(registrations.filter(([, route]) => route === "/landlord/listings/:listingId/images")).toStrictEqual([
      ["post", "/landlord/listings/:listingId/images"]
    ]);
    expect(registrations).toContainEqual(["delete", "/landlord/listings/:listingId/images/:imageId"]);
    expect(registrations).toContainEqual(["put", "/landlord/listings/:listingId/images/order"]);
    expect(routes).not.toMatch(/replace|bulk|favorite/i);
    expect(routes.match(/router\.post\(\s*"\/admin\/listings\/:listingId\/moderation-actions"/g)).toHaveLength(1);
    expect(routes).not.toMatch(/\/admin\/users/i);
  });

  it("keeps Cloudinary and Multer bounded to the integration, upload, and composition seams", async () => {
    const cloudinaryClient = await readFile(path.join(backendRoot, "src/integrations/cloudinary.client.ts"), "utf8");
    const uploadSources = (
      await Promise.all(
        [
          "listing-image-upload-controller.ts",
          "listing-image-upload-multipart.ts",
          "listing-image-upload-repository.ts",
          "listing-image-upload-service.ts",
          "listing-image-upload-validation.ts"
        ].map(source)
      )
    ).join("\n");
    const packageJson = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(cloudinaryClient).toContain('from "cloudinary"');
    expect(cloudinaryClient).toContain("upload_stream");
    expect(cloudinaryClient).toContain("timeout: cloudinaryRequestTimeoutMilliseconds");
    expect(uploadSources).not.toMatch(/from "cloudinary"|cloudinary\.v2/);
    expect(packageJson.dependencies.cloudinary).toBe("^2.10.0");
    expect(packageJson.dependencies.multer).toBe("^2.2.0");
    expect(packageJson.devDependencies["@types/multer"]).toBe("^2.1.0");
    expect(Object.keys(packageJson.dependencies)).not.toEqual(
      expect.arrayContaining(["file-type", "sharp", "formidable", "busboy"])
    );
  });

  it("keeps provider IDs private and omits retry, queue, worker, outbox, replacement, and bulk behavior", async () => {
    const controller = await source("listing-image-upload-controller.ts");
    const service = await source("listing-image-upload-service.ts");
    const repository = await source("listing-image-upload-repository.ts");
    const cleanup = await source("listing-delete-cloudinary-cleanup.ts");
    expect(controller).toContain("mapOwnerImageToDto(image)");
    expect(controller).not.toMatch(/publicId|cloudinaryPublicId|cloudinary_public_id/);
    expect(repository).toContain("cloudinary_public_id");
    expect(service).toContain("resolveListingStatusAfterMutation");
    expect(cleanup).toContain("Promise.allSettled");
    expect([controller, service, repository, cleanup].join("\n")).not.toMatch(
      /blind.?retry|retry.?loop|queue|worker|outbox|replace.?image|bulk.?upload|browser.?upload/i
    );
  });

  it("preserves RM-027 delete transaction files while wiring post-commit Cloudinary cleanup", async () => {
    const composition = await readFile(path.join(backendRoot, "src/server-composition.ts"), "utf8");
    const server = await readFile(path.join(backendRoot, "src/server.ts"), "utf8");
    expect(composition).toContain("createListingDeleteCloudinaryCleanup(options.cloudinaryClient)");
    expect(composition).toContain("options.listingDeleteCleanupHandoff ??");
    expect(server).toContain("createCloudinaryClient(");
  });

  it("keeps the frozen schema, business modules, and ephemeral upload boundary", async () => {
    const migrations = (await readdir(path.join(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect((await readdir(path.join(backendRoot, "src/modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    await expect(access(path.join(backendRoot, "uploads"))).rejects.toBeDefined();
  });
});

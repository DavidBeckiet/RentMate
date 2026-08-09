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

describe("RM-031 application isolation", () => {
  it("contains exactly 55 listings files and fifteen routes through V1-22 plus V1-09", async () => {
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(55);
    expect(files.filter((file) => file.startsWith("listing-image-order-"))).toStrictEqual([
      "listing-image-order-controller.ts",
      "listing-image-order-repository.ts",
      "listing-image-order-service.ts",
      "listing-image-order-validation.ts"
    ]);
    const routes = await source("routes.ts");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toHaveLength(15);
    expect(registrations.filter(([, route]) => route === "/listings")).toStrictEqual([["get", "/listings"]]);
    expect(registrations.filter((entry) => entry[0] === "post" && entry[1]?.endsWith("/images"))).toHaveLength(1);
    expect(
      registrations.filter((entry) => entry[0] === "delete" && entry[1]?.endsWith("/images/:imageId"))
    ).toHaveLength(1);
    expect(registrations.filter((entry) => entry[0] === "put" && entry[1]?.endsWith("/images/order"))).toHaveLength(1);
    expect(registrations.filter((entry) => entry[0] === "post" && entry[1] === "/geocoding/forward")).toHaveLength(1);
    expect(routes).not.toMatch(/favorite|admin/i);
  });

  it("keeps RM-031 database-only, transaction-bound, lifecycle-neutral, and provider-free", async () => {
    const controller = await source("listing-image-order-controller.ts");
    const validation = await source("listing-image-order-validation.ts");
    const repository = await source("listing-image-order-repository.ts");
    const service = await source("listing-image-order-service.ts");
    const combined = [controller, validation, repository, service].join("\n");
    expect(repository.replace(/\s+/g, " ")).toContain(
      "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l"
    );
    expect(repository).toContain("SET CONSTRAINTS uq_listing_images_listing_display_order DEFERRED");
    expect(repository).toMatch(/unnest\(\$2::integer\[\], \$3::smallint\[\]\)/);
    expect(repository).toContain("SET updated_at = CURRENT_TIMESTAMP");
    expect(repository).not.toMatch(/SET\s+status|moderation_history|BEGIN|COMMIT|cloudinary_public_id/i);
    expect(combined).not.toMatch(/listing-lifecycle-policy|CloudinaryClient|cloudinary\.v2|uploadImage|removeImage/i);
    expect(combined).not.toMatch(/temporary|negative.?slot|\+\s*100|queue|worker|outbox|retry/i);
  });

  it("reuses the existing deferrable constraint without schema or dependency changes", async () => {
    const migrations = (await readdir(path.join(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    const schema = await readFile(path.join(backendRoot, "migrations/0008_create_listing_images.sql"), "utf8");
    expect(schema).toMatch(/uq_listing_images_listing_display_order[\s\S]*DEFERRABLE INITIALLY IMMEDIATE/i);
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

  it("changes no provider, lifecycle, schema, lockfile, config, fixture, frontend, or frozen path", () => {
    expect(
      gitDiff(
        ".env.example",
        "backend/package-lock.json",
        "package-lock.json",
        "backend/src/app.ts",
        "backend/src/config/env.ts",
        "backend/src/integrations/cloudinary.client.ts",
        "backend/src/modules/listings/listing-lifecycle-policy.ts",
        "backend/src/modules/listings/listing-image-upload-controller.ts",
        "backend/src/modules/listings/listing-image-upload-multipart.ts",
        "backend/src/modules/listings/listing-image-upload-repository.ts",
        "backend/src/modules/listings/listing-image-upload-service.ts",
        "backend/src/modules/listings/listing-image-upload-validation.ts",
        "backend/src/modules/listings/listing-image-delete-controller.ts",
        "backend/src/modules/listings/listing-image-delete-repository.ts",
        "backend/src/modules/listings/listing-image-delete-service.ts",
        "backend/src/modules/listings/listing-delete-controller.ts",
        "backend/src/modules/listings/listing-delete-repository.ts",
        "backend/src/modules/listings/listing-delete-service.ts",
        "backend/src/modules/listings/listing-delete-cleanup.ts",
        "backend/src/modules/listings/listing-delete-cloudinary-cleanup.ts",
        "backend/test/helpers/listings-phase4-fixture.ts",
        "backend/test/support/test-database.ts",
        "backend/migrations",
        "frontend",
        "docs",
        "AGENTS.md"
      )
    ).toBe("");
  });
});

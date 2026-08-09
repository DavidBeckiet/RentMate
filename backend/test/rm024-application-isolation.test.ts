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

async function productionSources(): Promise<Record<string, string>> {
  const filenames = (await readdir(listingsRoot)).filter((filename) => filename.endsWith(".ts"));
  return Object.fromEntries(
    await Promise.all(
      filenames.map(async (filename) => [filename, await readFile(path.join(listingsRoot, filename), "utf8")])
    )
  );
}

describe("RM-024 application isolation", () => {
  it("keeps the exact through-RM-024 production inventory and route surface", async () => {
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
    expect(routes).not.toMatch(/favorite|admin/i);
  });

  it("contains exactly one focused significant-edit matrix and no PATCH-local copy", async () => {
    const sources = await productionSources();
    const policy = sources["listing-lifecycle-policy.ts"]!;
    const state = sources["listing-update-state.ts"]!;
    const significantOutcome = /case "REJECTED":\s*return "DRAFT"/g;
    expect(Object.values(sources).flatMap((source) => source.match(significantOutcome) ?? [])).toHaveLength(1);
    expect(policy.match(/case "(?:DRAFT|PENDING|REJECTED|APPROVED|INACTIVE|HIDDEN)":/g)).toHaveLength(12);
    expect(state).not.toMatch(/Readonly<Record<ListingStatus, ListingStatus>>|REJECTED:\s*"DRAFT"/);
    expect(state).toContain('changed ? "SIGNIFICANT_CONTENT_CHANGE" : "NO_STATUS_CHANGE"');
    expect(policy).not.toMatch(/submit|deactivate|reactivate|admin|moderation|image|transaction|timestamp|sql/i);
    expect(policy).not.toMatch(/Base|Generic|Engine|Workflow|Registry|Container|Decorator/);
  });

  it("keeps current-reason reads narrow, ordered, executor-bound, and non-N+1", async () => {
    const repository = await readFile(path.join(listingsRoot, "current-moderation-reason-repository.ts"), "utf8");
    const ownerRepository = await readFile(path.join(listingsRoot, "owner-listing-read-repository.ts"), "utf8");
    const normalized = repository.replace(/\s+/g, " ");
    expect(normalized).toContain("SELECT reason FROM moderation_history");
    expect(normalized).toContain("WHERE listing_id = $1 AND new_status = $2");
    expect(normalized).toContain("ORDER BY created_at DESC, id DESC LIMIT 1");
    expect(repository).toContain("queryOptional<CurrentModerationReasonRow, string>(");
    expect(repository).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|FOR UPDATE)\b/i);
    expect(repository).not.toMatch(/pool|SELECT \*|admin_id|previous_status/i);
    expect(ownerRepository).toContain("LEFT JOIN LATERAL");
    expect(ownerRepository).toContain("createCurrentModerationReasonRepository(executor)");
    expect(ownerRepository).not.toMatch(/for\s*\([^)]*\)\s*\{[\s\S]*findLatestReason/i);
  });

  it("adds no moderation write, provider implementation, public reason projection, or framework", async () => {
    const sources = await productionSources();
    const combined = Object.values(sources).join("\n");
    expect(combined).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+moderation_history/i);
    expect(combined).not.toMatch(/bulk.?upload|image.?replacement|queue|worker|outbox/i);
    expect(combined).not.toMatch(
      /BaseRepository|GenericRepository|DIContainer|module.?registry|event.?bus|workflow.?engine|route.?discovery/i
    );
    const routes = sources["routes.ts"]!;
    expect(routes).not.toMatch(/currentModerationReason|moderationHistory|adminId|previousStatus|newStatus/);
  });

  it("keeps composition, schema, dependencies, locks, frontend, and frozen documents unchanged", async () => {
    expect(
      gitDiff(
        "backend/src/app.ts",
        "backend/src/shared",
        "backend/src/db",
        "backend/migrations",
        "package-lock.json",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example"
      )
    ).toBe("");
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
    const migrations = (await readdir(path.join(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
  });
});

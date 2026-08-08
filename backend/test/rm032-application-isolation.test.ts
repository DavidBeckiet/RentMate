import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.join(backendRoot, "src/modules/listings");

async function listingSource(filename: string): Promise<string> {
  return readFile(path.join(listingsRoot, filename), "utf8");
}

async function recursiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await recursiveFiles(absolute)));
    else files.push(absolute);
  }
  return files.sort();
}

describe("RM-032 application isolation", () => {
  it("keeps exactly 50 listings production files and fourteen routes through V1-22", async () => {
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(50);
    const routes = await listingSource("routes.ts");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toHaveLength(14);
    expect(
      registrations.filter((entry) => entry[0] === "delete" && entry[1] === "/landlord/listings/:listingId")
    ).toHaveLength(1);
    expect(
      registrations.filter((entry) => entry[0] === "post" && entry[1]?.endsWith("/:listingId/images"))
    ).toHaveLength(1);
    expect(
      registrations.filter((entry) => entry[0] === "delete" && entry[1]?.endsWith("/images/:imageId"))
    ).toHaveLength(1);
    expect(registrations.filter((entry) => entry[0] === "put" && entry[1]?.endsWith("/images/order"))).toHaveLength(1);
    expect(registrations.filter((entry) => entry[0] === "post" && entry[1] === "/geocoding/forward")).toHaveLength(1);
    expect(routes).not.toMatch(/replace|bulk/i);
  });

  it("keeps replacement composed only from upload and delete without a new endpoint", async () => {
    const routes = await listingSource("routes.ts");
    expect(routes).not.toMatch(
      /router\.(?:put|patch)\([\s\S]{0,80}images\/:imageId|images\/:imageId\/replace|images\/replace|bulk.?replace/i
    );
    expect(routes.match(/"\/landlord\/listings\/:listingId\/images"/g)).toHaveLength(1);
    expect(routes.match(/"\/landlord\/listings\/:listingId\/images\/:imageId"/g)).toHaveLength(1);
  });

  it("preserves the single Cloudinary boundary, centralized lifecycle policy, and listing locks", async () => {
    expect((await readdir(path.join(backendRoot, "src/integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    const uploadRepository = await listingSource("listing-image-upload-repository.ts");
    const deleteRepository = await listingSource("listing-image-delete-repository.ts");
    const orderRepository = await listingSource("listing-image-order-repository.ts");
    const uploadService = await listingSource("listing-image-upload-service.ts");
    const deleteService = await listingSource("listing-image-delete-service.ts");
    const orderService = await listingSource("listing-image-order-service.ts");
    const phase6Production = [
      uploadRepository,
      deleteRepository,
      orderRepository,
      uploadService,
      deleteService,
      orderService,
      await listingSource("listing-delete-cloudinary-cleanup.ts")
    ].join("\n");
    for (const repository of [uploadRepository, deleteRepository, orderRepository]) {
      expect(repository.replace(/\s+/g, " ")).toContain(
        "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l"
      );
    }
    expect(uploadService).toContain("resolveListingStatusAfterMutation");
    expect(deleteService).toContain("resolveListingStatusAfterMutation");
    expect(orderService).not.toContain("resolveListingStatusAfterMutation");
    expect(phase6Production).not.toMatch(/retry.?framework|retry.?loop|queue|worker|outbox|background.?cleanup/i);
    const productionSources = await recursiveFiles(path.join(backendRoot, "src"));
    const cloudinaryImports = [];
    for (const filename of productionSources) {
      const source = await readFile(filename, "utf8");
      if (/from "cloudinary"/.test(source)) cloudinaryImports.push(path.relative(backendRoot, filename));
    }
    expect(cloudinaryImports).toStrictEqual([path.normalize("src/integrations/cloudinary.client.ts")]);
  });

  it("adds no schema, dependency, RM-034/RM-035 production, or RM-032 frontend surface", async () => {
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
    expect(await recursiveFiles(path.join(backendRoot, "src"))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/rm03[45]/i)])
    );
    expect(await recursiveFiles(path.join(repositoryRoot, "frontend"))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/rm032/i)])
    );
  });
});

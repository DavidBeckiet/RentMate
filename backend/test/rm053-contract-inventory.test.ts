import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  expectedColumnSignatures,
  expectedEnumTypes,
  expectedExplicitIndexes,
  expectedNamedConstraints,
  expectedProductTables
} from "../src/db/schema-verification/expected-schema.js";

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

interface ContractEvidence {
  readonly importantErrorPaths: readonly string[];
  readonly importantErrorReason?: string;
  readonly successPaths: readonly string[];
}

interface EndpointContract {
  readonly evidence: ContractEvidence;
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
}

const backendRoot = process.cwd();
const sourceRoot = path.join(backendRoot, "src");
const checklistPath = path.join(backendRoot, "test", "verification", "RM053_CONTRACT_INVENTORY.md");

const healthContract = Object.freeze({
  method: "GET" as const,
  path: "/api/health",
  evidence: Object.freeze({
    successPaths: ["test/app.test.ts"],
    importantErrorPaths: ["test/app.test.ts"]
  })
});

const endpointContracts: readonly EndpointContract[] = Object.freeze([
  {
    id: "V1-01",
    method: "POST",
    path: "/api/v1/auth/register/tenant",
    evidence: {
      successPaths: ["test/rm015-registration-http.integration.test.ts"],
      importantErrorPaths: ["test/rm015-registration-http.integration.test.ts"]
    }
  },
  {
    id: "V1-02",
    method: "POST",
    path: "/api/v1/auth/register/landlord",
    evidence: {
      successPaths: ["test/rm015-registration-http.integration.test.ts"],
      importantErrorPaths: ["test/rm015-registration-http.integration.test.ts"]
    }
  },
  {
    id: "V1-03",
    method: "POST",
    path: "/api/v1/auth/login",
    evidence: {
      successPaths: ["test/rm016-login-http.integration.test.ts"],
      importantErrorPaths: ["test/rm016-login-http.integration.test.ts"]
    }
  },
  {
    id: "V1-04",
    method: "POST",
    path: "/api/v1/auth/logout",
    evidence: {
      successPaths: ["test/rm016-logout-http.integration.test.ts"],
      importantErrorPaths: ["test/rm016-logout-http.integration.test.ts"]
    }
  },
  {
    id: "V1-05",
    method: "GET",
    path: "/api/v1/users/me",
    evidence: {
      successPaths: ["test/rm017-users-http.integration.test.ts"],
      importantErrorPaths: ["test/rm017-users-http.integration.test.ts"]
    }
  },
  {
    id: "V1-06",
    method: "PATCH",
    path: "/api/v1/users/me",
    evidence: {
      successPaths: ["test/rm017-users-http.integration.test.ts"],
      importantErrorPaths: ["test/rm017-users-http.integration.test.ts"]
    }
  },
  {
    id: "V1-07",
    method: "GET",
    path: "/api/v1/lookups/property-types",
    evidence: {
      successPaths: ["test/rm019-lookups-http.integration.test.ts"],
      importantErrorPaths: [],
      importantErrorReason: "The frozen read-only lookup contract defines no business-specific important-error branch."
    }
  },
  {
    id: "V1-08",
    method: "GET",
    path: "/api/v1/lookups/amenities",
    evidence: {
      successPaths: ["test/rm019-lookups-http.integration.test.ts"],
      importantErrorPaths: [],
      importantErrorReason: "The frozen read-only lookup contract defines no business-specific important-error branch."
    }
  },
  {
    id: "V1-09",
    method: "GET",
    path: "/api/v1/listings",
    evidence: {
      successPaths: ["test/rm035-public-search-http.integration.test.ts"],
      importantErrorPaths: ["test/rm038-public-discovery-http.integration.test.ts"]
    }
  },
  {
    id: "V1-10",
    method: "GET",
    path: "/api/v1/listings/:listingId",
    evidence: {
      successPaths: ["test/rm037-public-listing-detail-http.integration.test.ts"],
      importantErrorPaths: ["test/rm038-public-discovery-http.integration.test.ts"]
    }
  },
  {
    id: "V1-11",
    method: "POST",
    path: "/api/v1/landlord/listings",
    evidence: {
      successPaths: ["test/rm020-listing-create-http.integration.test.ts"],
      importantErrorPaths: ["test/rm020-listing-create-http.integration.test.ts"]
    }
  },
  {
    id: "V1-12",
    method: "GET",
    path: "/api/v1/landlord/listings",
    evidence: {
      successPaths: ["test/rm021-owner-listing-read-http.integration.test.ts"],
      importantErrorPaths: ["test/rm021-owner-listing-read-http.integration.test.ts"]
    }
  },
  {
    id: "V1-13",
    method: "GET",
    path: "/api/v1/landlord/listings/:listingId",
    evidence: {
      successPaths: ["test/rm021-owner-listing-read-http.integration.test.ts"],
      importantErrorPaths: ["test/rm021-owner-listing-read-http.integration.test.ts"]
    }
  },
  {
    id: "V1-14",
    method: "PATCH",
    path: "/api/v1/landlord/listings/:listingId",
    evidence: {
      successPaths: ["test/rm023-listing-update-http.integration.test.ts"],
      importantErrorPaths: ["test/rm023-listing-update-http.integration.test.ts"]
    }
  },
  {
    id: "V1-15",
    method: "DELETE",
    path: "/api/v1/landlord/listings/:listingId",
    evidence: {
      successPaths: ["test/rm027-listing-delete-http.integration.test.ts"],
      importantErrorPaths: ["test/rm027-listing-delete-http.integration.test.ts"]
    }
  },
  {
    id: "V1-16",
    method: "POST",
    path: "/api/v1/landlord/listings/:listingId/submit",
    evidence: {
      successPaths: ["test/rm025-listing-submit-http.integration.test.ts"],
      importantErrorPaths: ["test/rm025-listing-submit-http.integration.test.ts"]
    }
  },
  {
    id: "V1-17",
    method: "POST",
    path: "/api/v1/landlord/listings/:listingId/deactivate",
    evidence: {
      successPaths: ["test/rm026-listing-lifecycle-action-http.integration.test.ts"],
      importantErrorPaths: ["test/rm026-listing-lifecycle-action-http.integration.test.ts"]
    }
  },
  {
    id: "V1-18",
    method: "POST",
    path: "/api/v1/landlord/listings/:listingId/reactivate",
    evidence: {
      successPaths: ["test/rm026-listing-lifecycle-action-http.integration.test.ts"],
      importantErrorPaths: ["test/rm026-listing-lifecycle-action-http.integration.test.ts"]
    }
  },
  {
    id: "V1-19",
    method: "POST",
    path: "/api/v1/landlord/listings/:listingId/images",
    evidence: {
      successPaths: ["test/rm029-listing-image-upload-http.integration.test.ts"],
      importantErrorPaths: ["test/rm029-listing-image-upload-http.integration.test.ts"]
    }
  },
  {
    id: "V1-20",
    method: "DELETE",
    path: "/api/v1/landlord/listings/:listingId/images/:imageId",
    evidence: {
      successPaths: ["test/rm030-listing-image-delete-http.integration.test.ts"],
      importantErrorPaths: ["test/rm030-listing-image-delete-http.integration.test.ts"]
    }
  },
  {
    id: "V1-21",
    method: "PUT",
    path: "/api/v1/landlord/listings/:listingId/images/order",
    evidence: {
      successPaths: ["test/rm031-listing-image-order-http.integration.test.ts"],
      importantErrorPaths: ["test/rm031-listing-image-order-http.integration.test.ts"]
    }
  },
  {
    id: "V1-22",
    method: "POST",
    path: "/api/v1/geocoding/forward",
    evidence: {
      successPaths: ["test/rm033-geocoding-http.integration.test.ts"],
      importantErrorPaths: ["test/rm034-geocoding-http.integration.test.ts"]
    }
  },
  {
    id: "V1-23",
    method: "GET",
    path: "/api/v1/favorites",
    evidence: {
      successPaths: ["test/rm039-favorite-http.integration.test.ts"],
      importantErrorPaths: ["test/rm040-favorite-http.integration.test.ts"]
    }
  },
  {
    id: "V1-24",
    method: "PUT",
    path: "/api/v1/favorites/:listingId",
    evidence: {
      successPaths: ["test/rm039-favorite-http.integration.test.ts"],
      importantErrorPaths: ["test/rm040-favorite-http.integration.test.ts"]
    }
  },
  {
    id: "V1-25",
    method: "DELETE",
    path: "/api/v1/favorites/:listingId",
    evidence: {
      successPaths: ["test/rm039-favorite-http.integration.test.ts"],
      importantErrorPaths: ["test/rm040-favorite-http.integration.test.ts"]
    }
  },
  {
    id: "V1-26",
    method: "GET",
    path: "/api/v1/admin/listings",
    evidence: {
      successPaths: ["test/rm041-admin-listing-read-http.integration.test.ts"],
      importantErrorPaths: ["test/rm044-admin-authorization-http.integration.test.ts"]
    }
  },
  {
    id: "V1-27",
    method: "GET",
    path: "/api/v1/admin/listings/:listingId",
    evidence: {
      successPaths: ["test/rm041-admin-listing-read-http.integration.test.ts"],
      importantErrorPaths: ["test/rm044-admin-authorization-http.integration.test.ts"]
    }
  },
  {
    id: "V1-28",
    method: "GET",
    path: "/api/v1/admin/listings/:listingId/moderation-actions",
    evidence: {
      successPaths: ["test/rm041-admin-listing-read-http.integration.test.ts"],
      importantErrorPaths: ["test/rm044-admin-authorization-http.integration.test.ts"]
    }
  },
  {
    id: "V1-29",
    method: "POST",
    path: "/api/v1/admin/listings/:listingId/moderation-actions",
    evidence: {
      successPaths: ["test/rm042-moderation-action-http.integration.test.ts"],
      importantErrorPaths: ["test/rm042-moderation-action-http.integration.test.ts"]
    }
  },
  {
    id: "V1-30",
    method: "GET",
    path: "/api/v1/admin/users",
    evidence: {
      successPaths: ["test/rm043-admin-user-http.integration.test.ts"],
      importantErrorPaths: ["test/rm043-admin-user-http.integration.test.ts"]
    }
  },
  {
    id: "V1-31",
    method: "PATCH",
    path: "/api/v1/admin/users/:userId/activation",
    evidence: {
      successPaths: ["test/rm043-admin-user-http.integration.test.ts"],
      importantErrorPaths: ["test/rm043-admin-user-http.integration.test.ts"]
    }
  }
]);

const expectedEndpointIds = Array.from({ length: 31 }, (_value, index) => `V1-${String(index + 1).padStart(2, "0")}`);
const expectedExplicitIndexNames = [
  "idx_listings_status_updated_at",
  "idx_listings_landlord_updated_at",
  "idx_listings_approved_monthly_rent",
  "idx_listings_approved_property_type",
  "idx_listings_approved_room_area",
  "idx_listings_approved_latitude",
  "idx_listings_approved_longitude",
  "idx_listing_amenities_amenity_listing",
  "idx_favorites_tenant_created_at",
  "idx_moderation_history_listing_created_at"
].sort();

async function hasFile(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(backendRoot, relativePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function registeredRoutes(): Promise<string[]> {
  const modules = ["auth", "favorites", "listings", "users"] as const;
  const routeSources = await Promise.all(
    modules.map((module) => readFile(path.join(sourceRoot, "modules", module, "routes.ts"), "utf8"))
  );
  const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  return routeSources
    .flatMap((source) => [...source.matchAll(routePattern)].map((match) => `${match[1]}:${match[2]}`))
    .sort();
}

describe("RM-053 executable contract inventory", () => {
  it("records health and every frozen V1 method/path exactly once", async () => {
    const appSource = await readFile(path.join(sourceRoot, "app.ts"), "utf8");
    expect(`${healthContract.method} ${healthContract.path}`).toBe("GET /api/health");
    expect(appSource).toContain('app.get("/api/health"');
    expect(endpointContracts).toHaveLength(31);
    expect(endpointContracts.map(({ id }) => id)).toStrictEqual(expectedEndpointIds);
    expect(new Set(endpointContracts.map(({ id }) => id)).size).toBe(31);
    expect(new Set(endpointContracts.map(({ method, path: endpointPath }) => `${method} ${endpointPath}`)).size).toBe(
      31
    );
    expect(await registeredRoutes()).toStrictEqual(
      endpointContracts
        .map(({ method, path: endpointPath }) => `${method.toLowerCase()}:${endpointPath.replace("/api/v1", "")}`)
        .sort()
    );
  });

  it("requires executable success/error evidence and a checklist entry for every contract", async () => {
    const checklist = await readFile(checklistPath, "utf8");
    const evidencePaths = [
      ...healthContract.evidence.successPaths,
      ...healthContract.evidence.importantErrorPaths,
      ...endpointContracts.flatMap(({ evidence }) => [...evidence.successPaths, ...evidence.importantErrorPaths])
    ];
    await expect(Promise.all(evidencePaths.map(hasFile))).resolves.toStrictEqual(evidencePaths.map(() => true));

    for (const endpoint of endpointContracts) {
      expect(endpoint.evidence.successPaths.length).toBeGreaterThan(0);
      expect(
        endpoint.evidence.importantErrorPaths.length > 0 ||
          (endpoint.evidence.importantErrorReason?.trim().length ?? 0) > 0
      ).toBe(true);
      expect(checklist).toContain(endpoint.id);
    }
    expect(checklist).toContain("Health GREEN = 1");
    expect(checklist).toContain("V1 GREEN = 31");
    expect(checklist).toContain("V1 YELLOW = 0");
    expect(checklist).toContain("V1 RED = 0");
  });

  it("records the frozen two-enum, eight-table, schema-count, and explicit-index inventories", () => {
    expect(expectedEnumTypes).toStrictEqual([
      { name: "listing_status", labels: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] },
      { name: "user_role", labels: ["TENANT", "LANDLORD", "ADMIN"] }
    ]);
    expect([...expectedProductTables].sort()).toStrictEqual([
      "amenities",
      "favorites",
      "listing_amenities",
      "listing_images",
      "listings",
      "moderation_history",
      "property_types",
      "users"
    ]);
    expect(expectedColumnSignatures).toHaveLength(53);
    expect(expectedNamedConstraints).toHaveLength(52);
    expect(expectedExplicitIndexes.map(({ name }) => name).sort()).toStrictEqual(expectedExplicitIndexNames);
  });
});

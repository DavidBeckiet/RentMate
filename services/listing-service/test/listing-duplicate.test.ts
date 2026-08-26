import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { CreatedListing } from "../src/modules/listings/mappers/owner-listing-mapper.js";
import type {
  DuplicableListingSource,
  ListingDuplicateSourceRepository,
  ListingDuplicateSourceRepositoryFactory
} from "../src/modules/listings/repositories/listing-duplicate-repository.js";
import type {
  InsertListingDraftRecord,
  ListingCreateRepository,
  ListingCreateRepositoryFactory,
  ResolvedControlledLookup
} from "../src/modules/listings/repositories/listing-create-repository.js";
import { createListingDuplicateService } from "../src/modules/listings/services/listing-duplicate-service.js";
import type { TransactionRunner } from "../src/modules/listings/services/listing-create-service.js";
import { validateOwnerListingCollectionQuery } from "../src/modules/listings/validations/owner-listing-read-validation.js";

const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 31, role: "TENANT" });

const propertyType: ResolvedControlledLookup = Object.freeze({ id: 4, code: "STUDIO", label: "Studio" });
const amenities: readonly ResolvedControlledLookup[] = Object.freeze([
  Object.freeze({ id: 8, code: "WIFI", label: "Wi-Fi" }),
  Object.freeze({ id: 9, code: "PARKING", label: "Chỗ để xe" })
]);

const source: DuplicableListingSource = Object.freeze({
  content: Object.freeze({
    propertyTypeId: propertyType.id,
    title: "Studio trung tâm",
    description: "Gần trường đại học",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    maxOccupants: 2,
    addressText: "12 Đường Mẫu",
    areaName: "Quận 1",
    latitude: 10.77,
    longitude: 106.7
  }),
  propertyType,
  amenities
});

const createdListing: CreatedListing = Object.freeze({
  id: 101,
  status: "DRAFT",
  businessStatus: "UNKNOWN",
  title: source.content.title,
  description: source.content.description,
  monthlyRent: source.content.monthlyRent,
  roomAreaSqm: source.content.roomAreaSqm,
  maxOccupants: source.content.maxOccupants,
  addressText: source.content.addressText,
  areaName: source.content.areaName,
  latitude: source.content.latitude,
  longitude: source.content.longitude,
  availabilityConfirmedAt: null,
  availabilityReminderSentAt: null,
  availabilityReminderNotifiedAt: null,
  availabilityAutoPausedAt: null,
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z")
});

function setup(options: { readonly source?: DuplicableListingSource | null } = {}) {
  const calls: { readonly listingId: number; readonly landlordId: number }[] = [];
  const inserted: InsertListingDraftRecord[] = [];
  const insertedAmenityIds: number[][] = [];
  const sourceRepository: ListingDuplicateSourceRepository = {
    findOwnedSource: async (listingId, landlordId) => {
      calls.push({ listingId, landlordId });
      return options.source === undefined ? source : options.source;
    }
  };
  const createRepository: ListingCreateRepository = {
    findActivePropertyTypeByCode: async () => propertyType,
    findActiveAmenitiesByCodes: async () => amenities,
    insertDraft: async (record) => {
      inserted.push(record);
      return createdListing;
    },
    insertListingAmenities: async (listingId, amenityIds) => {
      assert.equal(listingId, createdListing.id);
      insertedAmenityIds.push([...amenityIds]);
    }
  };
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const sourceRepositoryFactory: ListingDuplicateSourceRepositoryFactory = () => sourceRepository;
  const createRepositoryFactory: ListingCreateRepositoryFactory = () => createRepository;
  const service = createListingDuplicateService({ transactionRunner, sourceRepositoryFactory, createRepositoryFactory });
  return { service, calls, inserted, insertedAmenityIds };
}

test("duplicates owned content into a new draft without copying images", async () => {
  const fixture = setup();

  const result = await fixture.service.duplicateListing(landlord, 42);

  assert.deepEqual(fixture.calls, [{ listingId: 42, landlordId: 30 }]);
  assert.deepEqual(fixture.inserted, [
    {
      landlordId: 30,
      propertyTypeId: 4,
      title: "Studio trung tâm",
      description: "Gần trường đại học",
      monthlyRent: 7_500_000,
      roomAreaSqm: 28.5,
      maxOccupants: 2,
      addressText: "12 Đường Mẫu",
      areaName: "Quận 1",
      latitude: 10.77,
      longitude: 106.7
    }
  ]);
  assert.deepEqual(fixture.insertedAmenityIds, [[8, 9]]);
  assert.equal(result.id, 101);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.businessStatus, "UNKNOWN");
  assert.equal(result.images.length, 0);
  assert.deepEqual(result.amenities, [
    { code: "PARKING", label: "Chỗ để xe" },
    { code: "WIFI", label: "Wi-Fi" }
  ]);
});

test("validates the optional owner business-status filter", () => {
  assert.deepEqual(validateOwnerListingCollectionQuery({ status: "approved", businessStatus: " rented " }), {
    status: "APPROVED",
    businessStatus: "RENTED",
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.throws(
    () => validateOwnerListingCollectionQuery({ businessStatus: "SOLD" }),
    /invalid data/i
  );
});

test("enforces landlord role and ownership without creating a draft", async () => {
  const forbidden = setup();
  await assert.rejects(
    forbidden.service.duplicateListing(tenant, 42),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  assert.equal(forbidden.calls.length, 0);

  const missing = setup({ source: null });
  await assert.rejects(
    missing.service.duplicateListing(landlord, 999),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
  assert.equal(missing.inserted.length, 0);
});

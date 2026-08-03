import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type {
  ListingCreateRepository,
  ListingCreateRepositoryFactory,
  ResolvedControlledLookup
} from "../src/modules/listings/listing-create-repository.js";
import { createListingCreateService, type TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type { CreateListingDraftInput } from "../src/modules/listings/listing-create-validation.js";
import type { CreatedListing } from "../src/modules/listings/owner-listing-mapper.js";
import type { AuthenticatedPrincipal } from "../src/shared/types/authentication.js";

const executor = Object.freeze({ query: vi.fn() }) as unknown as SqlExecutor;
const propertyType: ResolvedControlledLookup = Object.freeze({ id: 2, code: "STUDIO", label: "Studio" });
const amenities: readonly ResolvedControlledLookup[] = Object.freeze([
  Object.freeze({ id: 3, code: "FURNISHED", label: "Furnished" }),
  Object.freeze({ id: 2, code: "WIFI", label: "Wi-Fi" })
]);
const createdListing: CreatedListing = Object.freeze({
  id: 42,
  status: "DRAFT",
  title: "Studio",
  description: null,
  monthlyRent: 7_500_000,
  roomAreaSqm: 28.5,
  addressText: null,
  areaName: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  createdAt: new Date("2026-08-04T01:00:00.000Z"),
  updatedAt: new Date("2026-08-04T01:00:00.000Z")
});
const completeInput: CreateListingDraftInput = Object.freeze({
  title: "Studio",
  description: null,
  monthlyRent: 7_500_000,
  propertyTypeCode: "STUDIO",
  roomAreaSqm: 28.5,
  addressText: null,
  areaName: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  amenityCodes: Object.freeze(["WIFI", "FURNISHED"])
});

function principal(role: AuthenticatedPrincipal["role"] = "LANDLORD"): AuthenticatedPrincipal {
  return Object.freeze({ userId: 17, role });
}

function makeRepository(overrides: Partial<ListingCreateRepository> = {}): ListingCreateRepository {
  return {
    findActivePropertyTypeByCode: vi.fn().mockResolvedValue(propertyType),
    findActiveAmenitiesByCodes: vi.fn().mockResolvedValue(amenities),
    insertDraft: vi.fn().mockResolvedValue(createdListing),
    insertListingAmenities: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function makeTransactionRunner(events: string[] = []): TransactionRunner {
  return async <Value>(operation: (transaction: SqlExecutor) => Promise<Value>): Promise<Value> => {
    events.push("BEGIN");
    try {
      const value = await operation(executor);
      events.push("COMMIT");
      return value;
    } catch (error) {
      events.push("ROLLBACK");
      throw error;
    }
  };
}

describe("RM-020 listing-create service", () => {
  it("uses the principal ID, one transaction executor, and ordered create operations", async () => {
    const events: string[] = [];
    const repository = makeRepository({
      findActivePropertyTypeByCode: vi.fn(async () => {
        events.push("property");
        return propertyType;
      }),
      findActiveAmenitiesByCodes: vi.fn(async () => {
        events.push("amenities");
        return amenities;
      }),
      insertDraft: vi.fn(async () => {
        events.push("listing");
        return createdListing;
      }),
      insertListingAmenities: vi.fn(async () => {
        events.push("junction");
      })
    });
    const repositoryFactory = vi.fn(() => repository) as ListingCreateRepositoryFactory;
    const transactionSpy = vi.fn();
    const runTransaction = makeTransactionRunner(events);
    const transactionRunner: TransactionRunner = async <Value>(
      operation: (transaction: SqlExecutor) => Promise<Value>
    ): Promise<Value> => {
      transactionSpy();
      return runTransaction(operation);
    };
    const service = createListingCreateService({ transactionRunner, repositoryFactory });

    const result = await service.createDraft(principal(), completeInput);

    expect(result).toMatchObject({
      id: 42,
      status: "DRAFT",
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "FURNISHED", label: "Furnished" },
        { code: "WIFI", label: "Wi-Fi" }
      ]
    });
    expect(transactionSpy).toHaveBeenCalledOnce();
    expect(repositoryFactory).toHaveBeenCalledWith(executor);
    expect(repository.insertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        landlordId: 17,
        propertyTypeId: 2
      })
    );
    expect(repository.insertListingAmenities).toHaveBeenCalledWith(42, [3, 2]);
    expect(events).toStrictEqual(["BEGIN", "property", "amenities", "listing", "junction", "COMMIT"]);
  });

  it.each(["TENANT", "ADMIN"] as const)("defensively rejects %s before opening a transaction", async (role) => {
    const transactionSpy = vi.fn();
    const runTransaction = makeTransactionRunner();
    const transactionRunner: TransactionRunner = async <Value>(
      operation: (transaction: SqlExecutor) => Promise<Value>
    ): Promise<Value> => {
      transactionSpy();
      return runTransaction(operation);
    };
    const service = createListingCreateService({ transactionRunner, repositoryFactory: vi.fn() });

    await expect(service.createDraft(principal(role), completeInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403
    });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("skips controlled-value reads and junction writes for an empty draft", async () => {
    const repository = makeRepository();
    const service = createListingCreateService({
      transactionRunner: makeTransactionRunner(),
      repositoryFactory: () => repository
    });
    const emptyInput: CreateListingDraftInput = Object.freeze({
      ...completeInput,
      propertyTypeCode: null,
      amenityCodes: Object.freeze([])
    });

    await service.createDraft(principal(), emptyInput);

    expect(repository.findActivePropertyTypeByCode).not.toHaveBeenCalled();
    expect(repository.findActiveAmenitiesByCodes).not.toHaveBeenCalled();
    expect(repository.insertDraft).toHaveBeenCalledWith(expect.objectContaining({ propertyTypeId: null }));
    expect(repository.insertListingAmenities).not.toHaveBeenCalled();
  });

  it("maps unavailable property types to 422 and rolls back before insert", async () => {
    const events: string[] = [];
    const repository = makeRepository({ findActivePropertyTypeByCode: vi.fn().mockResolvedValue(null) });
    const service = createListingCreateService({
      transactionRunner: makeTransactionRunner(events),
      repositoryFactory: () => repository
    });

    await expect(service.createDraft(principal(), completeInput)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422,
      details: [expect.objectContaining({ field: "propertyTypeCode" })]
    });
    expect(repository.insertDraft).not.toHaveBeenCalled();
    expect(events).toStrictEqual(["BEGIN", "ROLLBACK"]);
  });

  it("requires exact resolved amenity set equality and rolls back before insert", async () => {
    const events: string[] = [];
    const repository = makeRepository({
      findActiveAmenitiesByCodes: vi.fn().mockResolvedValue([amenities[0]])
    });
    const service = createListingCreateService({
      transactionRunner: makeTransactionRunner(events),
      repositoryFactory: () => repository
    });

    await expect(service.createDraft(principal(), completeInput)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422,
      details: [expect.objectContaining({ field: "amenityCodes" })]
    });
    expect(repository.insertDraft).not.toHaveBeenCalled();
    expect(events.at(-1)).toBe("ROLLBACK");
  });

  it.each(["listing", "junction"] as const)("propagates a %s failure through rollback", async (stage) => {
    const failure = new Error(`private ${stage} failure`);
    const events: string[] = [];
    const repository = makeRepository({
      insertDraft: stage === "listing" ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(createdListing),
      insertListingAmenities:
        stage === "junction" ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(undefined)
    });
    const service = createListingCreateService({
      transactionRunner: makeTransactionRunner(events),
      repositoryFactory: () => repository
    });

    await expect(service.createDraft(principal(), completeInput)).rejects.toBe(failure);
    expect(events.at(-1)).toBe("ROLLBACK");
  });
});

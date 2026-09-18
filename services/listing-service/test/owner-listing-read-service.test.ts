import assert from "node:assert/strict";
import test from "node:test";
import type { Response, Request } from "express";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import { sendPaginated } from "../../shared/src/runtime/shared/http/responses.js";
import { createListOwnerListingsHandler } from "../src/modules/listings/controllers/owner-listing-read-controller.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/repositories/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "../src/modules/listings/services/owner-listing-read-service.js";
import type { OwnerListingCollectionQuery } from "../src/modules/listings/validations/owner-listing-read-validation.js";

const landlord: AuthenticatedPrincipal = { userId: 27, role: "LANDLORD" };

function createReadRepository(hasEverApprovedListing: boolean) {
  const pageInputs: Parameters<OwnerListingReadRepository["findOwnerListingPage"]>[0][] = [];
  const approvalOwners: number[] = [];
  const repository: OwnerListingReadRepository = {
    async findOwnerListingPage(input) {
      pageInputs.push(input);
      return [];
    },
    async hasEverApprovedListing(landlordId) {
      approvalOwners.push(landlordId);
      return hasEverApprovedListing;
    },
    async findOwnerListingDetailBase() {
      return null;
    },
    async findAmenitiesForListing() {
      return [];
    },
    async findImagesForListing() {
      return [];
    },
    async findCurrentModerationReason() {
      return null;
    }
  };
  return { repository, pageInputs, approvalOwners };
}

const query = (overrides: Partial<OwnerListingCollectionQuery> = {}): OwnerListingCollectionQuery => ({
  status: null,
  businessStatus: null,
  page: 1,
  pageSize: 20,
  offset: 0,
  ...overrides
});

test("owner metadata is independent of listing filters and pagination", async () => {
  const { repository, pageInputs, approvalOwners } = createReadRepository(true);
  const service = createOwnerListingReadService(repository);

  const firstPage = await service.listOwned(landlord, query({ status: "DRAFT", page: 1, offset: 0 }));
  const filteredLaterPage = await service.listOwned(
    landlord,
    query({ status: "PENDING", businessStatus: "RENTED", page: 4, pageSize: 50, offset: 150 })
  );

  assert.equal(firstPage.hasEverApprovedListing, true);
  assert.equal(filteredLaterPage.hasEverApprovedListing, true);
  assert.deepEqual(approvalOwners, [27, 27]);
  assert.deepEqual(pageInputs, [
    { landlordId: 27, status: "DRAFT", businessStatus: null, limit: 21, offset: 0 },
    { landlordId: 27, status: "PENDING", businessStatus: "RENTED", limit: 51, offset: 150 }
  ]);
});

test("owner metadata remains false when there is no APPROVED history event", async () => {
  const { repository } = createReadRepository(false);
  const service = createOwnerListingReadService(repository);

  const result = await service.listOwned(landlord, query());

  assert.equal(result.hasEverApprovedListing, false);
});

test("owner-list response exposes metadata at top level while legacy paginated responses omit it", async () => {
  const { repository } = createReadRepository(true);
  const service = createOwnerListingReadService(repository);
  const handler = createListOwnerListingsHandler(service);
  const request = { auth: landlord, query: {}, body: undefined } as unknown as Request;
  let statusCode: number | null = null;
  let responseBody: unknown;
  let resolveResponse: ((value: unknown) => void) | undefined;
  const responseReady = new Promise<unknown>((resolve) => {
    resolveResponse = resolve;
  });
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      responseBody = body;
      resolveResponse?.(body);
      return this;
    }
  } as unknown as Response;

  handler(request, response, (error?: unknown) => {
    if (error) throw error;
  });
  await responseReady;

  assert.equal(statusCode, 200);
  assert.deepEqual(responseBody, {
    data: [],
    pagination: { page: 1, pageSize: 20, hasNextPage: false },
    metadata: { hasEverApprovedListing: true }
  });

  let legacyBody: unknown;
  const legacyResponse = {
    status() {
      return this;
    },
    json(body: unknown) {
      legacyBody = body;
      return this;
    }
  } as unknown as Response;
  sendPaginated(legacyResponse, [], { page: 1, pageSize: 10, hasNextPage: false });
  assert.deepEqual(legacyBody, { data: [], pagination: { page: 1, pageSize: 10, hasNextPage: false } });
});

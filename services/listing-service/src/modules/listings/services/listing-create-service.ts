import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import {
  ApplicationError,
  createValidationError
} from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { validationDetail } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import {
  createListingCreateRepository,
  type ListingCreateRepositoryFactory,
  type ResolvedControlledLookup
} from "../repositories/listing-create-repository.js";
import type { CreateListingDraftInput } from "../validations/listing-create-validation.js";
import { createOwnerListing, type OwnerListing } from "../mappers/owner-listing-mapper.js";

export type TransactionRunner = <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;

export interface ListingCreateService {
  readonly createDraft: (principal: AuthenticatedPrincipal, input: CreateListingDraftInput) => Promise<OwnerListing>;
}

interface ListingCreateServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingCreateRepositoryFactory;
}

function unavailablePropertyType(): ApplicationError {
  return createValidationError([
    validationDetail("propertyTypeCode", "INVALID_VALUE", "propertyTypeCode must reference an available property type.")
  ]);
}

function unavailableAmenities(): ApplicationError {
  return createValidationError([
    validationDetail("amenityCodes", "INVALID_VALUE", "amenityCodes must reference only available amenities.")
  ]);
}

function containsExactlyRequestedCodes(
  requestedCodes: readonly string[],
  resolvedValues: readonly ResolvedControlledLookup[]
): boolean {
  if (requestedCodes.length !== resolvedValues.length) {
    return false;
  }

  const resolvedCodes = new Set(resolvedValues.map((value) => value.code));
  return resolvedCodes.size === requestedCodes.length && requestedCodes.every((code) => resolvedCodes.has(code));
}

export function createListingCreateService(dependencies: ListingCreateServiceDependencies): ListingCreateService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingCreateRepository;

  return Object.freeze({
    async createDraft(principal: AuthenticatedPrincipal, input: CreateListingDraftInput): Promise<OwnerListing> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      return dependencies.transactionRunner(async (executor) => {
        const repository = repositoryFactory(executor);
        let propertyType: ResolvedControlledLookup | null = null;

        if (input.propertyTypeCode !== null) {
          propertyType = await repository.findActivePropertyTypeByCode(input.propertyTypeCode);
          if (propertyType === null) {
            throw unavailablePropertyType();
          }
        }

        const amenities =
          input.amenityCodes.length === 0
            ? Object.freeze([])
            : await repository.findActiveAmenitiesByCodes(input.amenityCodes);
        if (!containsExactlyRequestedCodes(input.amenityCodes, amenities)) {
          throw unavailableAmenities();
        }

        const listing = await repository.insertDraft({
          landlordId: principal.userId,
          propertyTypeId: propertyType?.id ?? null,
          title: input.title,
          description: input.description,
          monthlyRent: input.monthlyRent,
          roomAreaSqm: input.roomAreaSqm,
          addressText: input.addressText,
          areaName: input.areaName,
          latitude: input.latitude,
          longitude: input.longitude
        });

        if (amenities.length > 0) {
          await repository.insertListingAmenities(
            listing.id,
            amenities.map((amenity) => amenity.id)
          );
        }

        return createOwnerListing(listing, propertyType, amenities);
      });
    }
  });
}

import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import {
  ApplicationError,
  createValidationError
} from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { validationDetail } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { findMissingListingCompletenessFields } from "../listing-completeness.js";
import type { TransactionRunner } from "./listing-create-service.js";
import {
  createListingSubmitRepository,
  type ListingSubmitRepositoryFactory,
  type LockedSubmissionListing,
  type SubmissionSourceStatus
} from "../repositories/listing-submit-repository.js";
import type { OwnerListingDetail } from "../mappers/owner-listing-mapper.js";
import { createOwnerListingReadRepository, type OwnerListingReadRepository } from "../repositories/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "./owner-listing-read-service.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const invalidTransitionMessage = "The listing cannot be submitted from its current status.";
const concurrentModificationMessage = "The listing changed during this request.";

export interface ListingSubmitService {
  readonly submitOwnedListing: (principal: AuthenticatedPrincipal, listingId: number) => Promise<OwnerListingDetail>;
}

interface ListingSubmitServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingSubmitRepositoryFactory;
  readonly ownerReadRepositoryFactory?: (executor: SqlExecutor) => OwnerListingReadRepository;
}

function sourceStatus(status: LockedSubmissionListing["status"]): SubmissionSourceStatus {
  if (status === "DRAFT" || status === "HIDDEN") return status;
  throw new ApplicationError("INVALID_LISTING_TRANSITION", invalidTransitionMessage);
}

function validateCompleteness(listing: Readonly<LockedSubmissionListing>): void {
  const missing = findMissingListingCompletenessFields({
    propertyType: listing.propertyTypePresent ? true : null,
    title: listing.title,
    description: listing.description,
    monthlyRent: listing.monthlyRent,
    roomAreaSqm: listing.roomAreaSqm,
    addressText: listing.addressText,
    areaName: listing.areaName,
    latitude: listing.latitude,
    longitude: listing.longitude
  });
  if (missing.length > 0) {
    throw createValidationError(missing.map((field) => validationDetail(field, "REQUIRED", `${field} is required.`)));
  }
}

function invalidReference(field: "propertyType" | "amenities"): ApplicationError {
  return createValidationError([validationDetail(field, "INVALID_VALUE", `${field} contains an unknown reference.`)]);
}

function missingImage(): ApplicationError {
  return createValidationError([validationDetail("images", "REQUIRED", "At least one persisted image is required.")]);
}

export function createListingSubmitService(dependencies: ListingSubmitServiceDependencies): ListingSubmitService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingSubmitRepository;
  const ownerReadFactory = dependencies.ownerReadRepositoryFactory ?? createOwnerListingReadRepository;

  return Object.freeze({
    async submitOwnedListing(principal: AuthenticatedPrincipal, listingId: number) {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      return dependencies.transactionRunner(async (executor) => {
        const repository = repositoryFactory(executor);
        const listing = await repository.lockOwnedListing(listingId, principal.userId);
        if (listing === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }

        const expectedStatus = sourceStatus(listing.status);
        validateCompleteness(listing);
        if (!listing.propertyTypeKnown || listing.propertyType === null) {
          throw invalidReference("propertyType");
        }
        if (!(await repository.areAmenityReferencesKnown(listingId))) {
          throw invalidReference("amenities");
        }
        if (!(await repository.hasPersistedImage(listingId))) {
          throw missingImage();
        }
        if (!(await repository.transitionToPending(listingId, principal.userId, expectedStatus))) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
        }

        return createOwnerListingReadService(ownerReadFactory(executor)).getOwnedDetail(principal, listingId);
      });
    }
  });
}

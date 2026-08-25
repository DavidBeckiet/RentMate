import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { OwnerListingDetail } from "../mappers/owner-listing-mapper.js";
import {
  createListingAvailabilityOwnerRepository,
  type ListingAvailabilityOwnerRepository,
  type ListingAvailabilityOwnerRepositoryFactory
} from "../repositories/listing-availability-owner-repository.js";
import {
  createOwnerListingReadRepository,
  type OwnerListingReadRepository
} from "../repositories/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "./owner-listing-read-service.js";
import type { TransactionRunner } from "./listing-create-service.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface ListingAvailabilityService {
  readonly confirmOwnedAvailability: (
    principal: AuthenticatedPrincipal,
    listingId: number
  ) => Promise<OwnerListingDetail>;
}

interface ListingAvailabilityServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingAvailabilityOwnerRepositoryFactory;
  readonly ownerReadRepositoryFactory?: (executor: SqlExecutor) => OwnerListingReadRepository;
}

export function createListingAvailabilityService(
  dependencies: ListingAvailabilityServiceDependencies
): ListingAvailabilityService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingAvailabilityOwnerRepository;
  const ownerReadFactory = dependencies.ownerReadRepositoryFactory ?? createOwnerListingReadRepository;

  return Object.freeze({
    async confirmOwnedAvailability(
      principal: AuthenticatedPrincipal,
      listingId: number
    ): Promise<OwnerListingDetail> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      return dependencies.transactionRunner(async (executor) => {
        const repository = repositoryFactory(executor);
        const listing = await repository.lockOwnedListing(listingId, principal.userId);
        if (listing === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }
        if (listing.status !== "APPROVED") {
          throw new ApplicationError(
            "INVALID_LISTING_TRANSITION",
            "Only an approved listing can confirm its current availability."
          );
        }
        if (listing.businessStatus === "RENTED") {
          throw new ApplicationError(
            "INVALID_LISTING_TRANSITION",
            "A rented listing cannot be confirmed as available."
          );
        }
        if (listing.businessStatus === "PAUSED" && listing.availabilityAutoPausedAt === null) {
          throw new ApplicationError(
            "INVALID_LISTING_TRANSITION",
            "A manually paused listing must be resumed before confirming availability."
          );
        }

        const changed =
          listing.businessStatus !== "AVAILABLE" ||
          listing.availabilityReminderSentAt !== null ||
          listing.availabilityConfirmedAt === null ||
          listing.availabilityAutoPausedAt !== null;
        if (changed) {
          await repository.confirmAvailability(listingId, principal.userId);
        }

        return createOwnerListingReadService(ownerReadFactory(executor)).getOwnedDetail(principal, listingId);
      });
    }
  });
}

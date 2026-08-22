import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "./listing-create-service.js";
import {
  createListingLifecycleActionRepository,
  type ListingAvailabilityTransition,
  type ListingLifecycleActionRepositoryFactory
} from "../repositories/listing-lifecycle-action-repository.js";
import type { OwnerListingDetail } from "../mappers/owner-listing-mapper.js";
import { createOwnerListingReadRepository, type OwnerListingReadRepository } from "../repositories/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "./owner-listing-read-service.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const concurrentModificationMessage = "The listing changed during this request.";

type ListingAvailabilityAction =
  | Readonly<{
      readonly name: "DEACTIVATE";
      readonly expectedStatus: "APPROVED";
      readonly nextStatus: "INACTIVE";
    }>
  | Readonly<{
      readonly name: "REACTIVATE";
      readonly expectedStatus: "INACTIVE";
      readonly nextStatus: "APPROVED";
    }>;

const deactivateAction = Object.freeze({
  name: "DEACTIVATE",
  expectedStatus: "APPROVED",
  nextStatus: "INACTIVE"
} as const);
const reactivateAction = Object.freeze({
  name: "REACTIVATE",
  expectedStatus: "INACTIVE",
  nextStatus: "APPROVED"
} as const);

export interface ListingLifecycleActionService {
  readonly deactivateOwnedListing: (
    principal: AuthenticatedPrincipal,
    listingId: number
  ) => Promise<OwnerListingDetail>;
  readonly reactivateOwnedListing: (
    principal: AuthenticatedPrincipal,
    listingId: number
  ) => Promise<OwnerListingDetail>;
}

interface ListingLifecycleActionServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingLifecycleActionRepositoryFactory;
  readonly ownerReadRepositoryFactory?: (executor: SqlExecutor) => OwnerListingReadRepository;
}

export function createListingLifecycleActionService(
  dependencies: ListingLifecycleActionServiceDependencies
): ListingLifecycleActionService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingLifecycleActionRepository;
  const ownerReadFactory = dependencies.ownerReadRepositoryFactory ?? createOwnerListingReadRepository;

  async function runAction(
    principal: AuthenticatedPrincipal,
    listingId: number,
    action: ListingAvailabilityAction
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
      if (listing.status !== action.expectedStatus) {
        throw new ApplicationError(
          "INVALID_LISTING_TRANSITION",
          `The listing cannot be ${action.name.toLowerCase()}d from its current status.`
        );
      }

      const transition: ListingAvailabilityTransition =
        action.name === "DEACTIVATE"
          ? Object.freeze({ expectedStatus: "APPROVED", nextStatus: "INACTIVE" })
          : Object.freeze({ expectedStatus: "INACTIVE", nextStatus: "APPROVED" });
      if (!(await repository.transitionStatus(listingId, principal.userId, transition))) {
        throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
      }

      return createOwnerListingReadService(ownerReadFactory(executor)).getOwnedDetail(principal, listingId);
    });
  }

  return Object.freeze({
    deactivateOwnedListing(principal: AuthenticatedPrincipal, listingId: number) {
      return runAction(principal, listingId, deactivateAction);
    },
    reactivateOwnedListing(principal: AuthenticatedPrincipal, listingId: number) {
      return runAction(principal, listingId, reactivateAction);
    }
  });
}

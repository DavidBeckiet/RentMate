import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { EngagementNotificationClient } from "../../../../../shared/engagement-notification-client.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import type { ListingBusinessStatusInput } from "../validations/business-status-validation.js";
import type { OwnerListingDetail } from "../mappers/owner-listing-mapper.js";
import {
  createListingBusinessStatusRepository,
  type ListingBusinessStatusRepositoryFactory
} from "../repositories/listing-business-status-repository.js";
import {
  createOwnerListingReadRepository,
  type OwnerListingReadRepository
} from "../repositories/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "./owner-listing-read-service.js";
import type { TransactionRunner } from "./listing-create-service.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const concurrentModificationMessage = "The listing changed during this request.";

export interface ListingBusinessStatusService {
  readonly updateOwnedBusinessStatus: (
    principal: AuthenticatedPrincipal,
    listingId: number,
    input: ListingBusinessStatusInput
  ) => Promise<OwnerListingDetail>;
}

interface ListingBusinessStatusServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingBusinessStatusRepositoryFactory;
  readonly ownerReadRepositoryFactory?: (executor: SqlExecutor) => OwnerListingReadRepository;
  readonly notificationClient?: Pick<EngagementNotificationClient, "notifyListingPublished">;
  readonly logger?: Pick<Logger, "warn">;
}

function isPublicListing(status: string, businessStatus: string): boolean {
  return status === "APPROVED" && (businessStatus === "AVAILABLE" || businessStatus === "UNKNOWN");
}

export function createListingBusinessStatusService(
  dependencies: ListingBusinessStatusServiceDependencies
): ListingBusinessStatusService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingBusinessStatusRepository;
  const ownerReadFactory = dependencies.ownerReadRepositoryFactory ?? createOwnerListingReadRepository;

  return Object.freeze({
    async updateOwnedBusinessStatus(
      principal: AuthenticatedPrincipal,
      listingId: number,
      input: ListingBusinessStatusInput
    ): Promise<OwnerListingDetail> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      const outcome = await dependencies.transactionRunner(async (executor) => {
        const repository = repositoryFactory(executor);
        const current = await repository.lockOwnedListing(listingId, principal.userId);
        if (current === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }
        const wasPublic = isPublicListing(current.status, current.businessStatus);

        if (current.businessStatus !== input.businessStatus) {
          const updated = await repository.updateBusinessStatus({
            listingId,
            landlordId: principal.userId,
            expectedStatus: current.businessStatus,
            nextStatus: input.businessStatus
          });
          if (!updated) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
          }
        }

        return Object.freeze({
          detail: await createOwnerListingReadService(ownerReadFactory(executor)).getOwnedDetail(principal, listingId),
          notifySavedSearches: !wasPublic && isPublicListing(current.status, input.businessStatus)
        });
      });

      if (outcome.notifySavedSearches && dependencies.notificationClient) {
        try {
          await dependencies.notificationClient.notifyListingPublished({ listingId });
        } catch (error) {
          dependencies.logger?.warn("Saved search notification delivery failed", {
            errorType: error instanceof Error ? error.name : "UnknownError",
            listingId
          });
        }
      }

      return outcome.detail;
    }
  });
}

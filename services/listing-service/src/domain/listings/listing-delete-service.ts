import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import type { Logger } from "../../../../shared/src/runtime/shared/logging/logger.js";
import { forbiddenRoleMessage } from "../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "./listing-create-service.js";
import type { ListingDeleteCleanupHandoff } from "./listing-delete-cleanup.js";
import { createListingDeleteRepository, type ListingDeleteRepositoryFactory } from "./listing-delete-repository.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const deleteNotAllowedMessage = "The listing cannot be deleted.";
const concurrentModificationMessage = "The listing changed during this request.";
const cleanupFailureMessage = "Listing delete cleanup handoff failed after database commit.";

export interface ListingDeleteService {
  readonly deleteOwnedListing: (principal: AuthenticatedPrincipal, listingId: number) => Promise<void>;
}

interface ListingDeleteServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly cleanupHandoff: ListingDeleteCleanupHandoff;
  readonly logger: Pick<Logger, "warn">;
  readonly repositoryFactory?: ListingDeleteRepositoryFactory;
}

export function createListingDeleteService(dependencies: ListingDeleteServiceDependencies): ListingDeleteService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingDeleteRepository;

  return Object.freeze({
    async deleteOwnedListing(principal: AuthenticatedPrincipal, listingId: number): Promise<void> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      const cloudinaryPublicIds = await dependencies.transactionRunner(async (executor: SqlExecutor) => {
        const repository = repositoryFactory(executor);
        const listing = await repository.lockOwnedListing(listingId, principal.userId);
        if (listing === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }
        if (listing.status !== "DRAFT") {
          throw new ApplicationError("LISTING_DELETE_NOT_ALLOWED", deleteNotAllowedMessage);
        }
        if (await repository.hasModerationHistory(listingId)) {
          throw new ApplicationError("LISTING_DELETE_NOT_ALLOWED", deleteNotAllowedMessage);
        }

        const capturedIds = Object.freeze([...(await repository.findCloudinaryPublicIds(listingId))]);
        if (!(await repository.deleteOwnedDraft(listingId, principal.userId))) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
        }
        return capturedIds;
      });

      try {
        await dependencies.cleanupHandoff.afterCommittedDelete(cloudinaryPublicIds);
      } catch (error) {
        dependencies.logger.warn(cleanupFailureMessage, {
          listingId,
          assetCount: cloudinaryPublicIds.length,
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
      }
    }
  });
}

import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { CloudinaryClient } from "../../../../../shared/src/runtime/integrations/cloudinary.client.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "./listing-create-service.js";
import {
  createListingImageDeleteRepository,
  type ListingImageDeleteRepositoryFactory
} from "../repositories/listing-image-delete-repository.js";
import { resolveListingStatusAfterMutation } from "../listing-lifecycle-policy.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const lastImageRequiredMessage = "A non-draft listing must retain at least one image.";
const concurrentModificationMessage = "The listing changed during this request.";
const cleanupFailureMessage = "Listing image delete cleanup failed after database commit.";

export interface ListingImageDeleteService {
  readonly deleteOwnedImage: (principal: AuthenticatedPrincipal, listingId: number, imageId: number) => Promise<void>;
}

interface ListingImageDeleteServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly cloudinaryClient: CloudinaryClient;
  readonly logger: Pick<Logger, "warn">;
  readonly repositoryFactory?: ListingImageDeleteRepositoryFactory;
}

export function createListingImageDeleteService(
  dependencies: ListingImageDeleteServiceDependencies
): ListingImageDeleteService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingImageDeleteRepository;

  return Object.freeze({
    async deleteOwnedImage(principal: AuthenticatedPrincipal, listingId: number, imageId: number): Promise<void> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      const cloudinaryPublicId = await dependencies.transactionRunner(async (executor: SqlExecutor) => {
        const repository = repositoryFactory(executor);
        const listing = await repository.lockOwnedListing(listingId, principal.userId);
        if (listing === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);

        const currentImages = await repository.findCurrentImages(listingId);
        const target = currentImages.find((image) => image.id === imageId);
        if (!target) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);

        if (listing.status !== "DRAFT" && currentImages.length === 1) {
          throw new ApplicationError("LAST_IMAGE_REQUIRED", lastImageRequiredMessage);
        }

        const resultingStatus = resolveListingStatusAfterMutation(listing.status, "SIGNIFICANT_CONTENT_CHANGE");
        if (!(await repository.deleteListingImage(listingId, imageId))) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
        }
        if (
          !(await repository.updateListingAfterImageDeletion({
            listingId,
            landlordId: principal.userId,
            currentStatus: listing.status,
            resultingStatus
          }))
        ) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
        }
        return target.cloudinaryPublicId;
      });

      try {
        await dependencies.cloudinaryClient.removeImage(cloudinaryPublicId);
      } catch (error) {
        dependencies.logger.warn(cleanupFailureMessage, {
          operation: "listing-image-delete-cleanup",
          listingId,
          imageId,
          assetCount: 1,
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
      }
    }
  });
}

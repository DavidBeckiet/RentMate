import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import type { CloudinaryClient } from "../../../../shared/src/runtime/integrations/cloudinary.client.js";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import type { Logger } from "../../../../shared/src/runtime/shared/logging/logger.js";
import { forbiddenRoleMessage } from "../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "./listing-create-service.js";
import {
  createListingImageUploadRepository,
  findSmallestUnusedDisplayOrder,
  type ListingImageUploadRepository,
  type ListingImageUploadRepositoryFactory
} from "./listing-image-upload-repository.js";
import type { ValidatedListingImageUpload } from "./listing-image-upload-validation.js";
import { resolveListingStatusAfterMutation } from "./listing-lifecycle-policy.js";
import type { OwnerImage } from "./owner-image-mapper.js";

const preflightMarker = Symbol("listing-image-upload-preflight");
const resourceNotFoundMessage = "The requested resource was not found.";
const imageLimitExceededMessage = "The listing already has the maximum number of images.";
const providerUnavailableMessage = "The image provider is unavailable.";
const concurrentModificationMessage = "The listing changed during this request.";
const compensationWarningMessage = "Listing image upload compensation failed.";

export interface ListingImageUploadPreflight {
  readonly listingId: number;
  readonly landlordId: number;
  readonly [preflightMarker]: true;
}

export interface ListingImageUploadService {
  readonly preflightOwnedUpload: (
    principal: AuthenticatedPrincipal,
    listingId: number
  ) => Promise<ListingImageUploadPreflight>;
  readonly completeOwnedUpload: (
    preflight: ListingImageUploadPreflight,
    upload: ValidatedListingImageUpload
  ) => Promise<OwnerImage>;
}

interface ListingImageUploadServiceDependencies {
  readonly preflightRepository: ListingImageUploadRepository;
  readonly transactionRunner: TransactionRunner;
  readonly cloudinaryClient: CloudinaryClient;
  readonly logger: Pick<Logger, "warn">;
  readonly repositoryFactory?: ListingImageUploadRepositoryFactory;
}

function imageLimitExceeded(): ApplicationError {
  return new ApplicationError("IMAGE_LIMIT_EXCEEDED", imageLimitExceededMessage);
}

export function createListingImageUploadService(
  dependencies: ListingImageUploadServiceDependencies
): ListingImageUploadService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingImageUploadRepository;

  return Object.freeze({
    async preflightOwnedUpload(principal: AuthenticatedPrincipal, listingId: number) {
      if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      const owned = await dependencies.preflightRepository.findOwnedImageCount(listingId, principal.userId);
      if (owned === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
      if (owned.imageCount >= 8) throw imageLimitExceeded();
      return Object.freeze({
        listingId: owned.listingId,
        landlordId: principal.userId,
        [preflightMarker]: true as const
      });
    },

    async completeOwnedUpload(preflight: ListingImageUploadPreflight, upload: ValidatedListingImageUpload) {
      if (preflight[preflightMarker] !== true) throw new Error("Listing image upload preflight is invalid.");

      let uploaded;
      try {
        uploaded = await dependencies.cloudinaryClient.uploadImage({
          buffer: upload.buffer,
          mimeType: upload.mimeType
        });
      } catch {
        throw new ApplicationError("PROVIDER_UNAVAILABLE", providerUnavailableMessage);
      }

      try {
        return await dependencies.transactionRunner(async (executor: SqlExecutor) => {
          const repository = repositoryFactory(executor);
          const listing = await repository.lockOwnedListing(preflight.listingId, preflight.landlordId);
          if (listing === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
          const slots = await repository.findCurrentImageSlots(preflight.listingId);
          const displayOrder = findSmallestUnusedDisplayOrder(slots);
          if (displayOrder === null) throw imageLimitExceeded();
          const resultingStatus = resolveListingStatusAfterMutation(listing.status, "SIGNIFICANT_CONTENT_CHANGE");
          const image = await repository.insertImageMetadata({
            listingId: preflight.listingId,
            uploaded,
            displayOrder,
            altText: upload.altText
          });
          if (
            !(await repository.updateListingAfterImageAddition({
              listingId: preflight.listingId,
              landlordId: preflight.landlordId,
              currentStatus: listing.status,
              resultingStatus
            }))
          ) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
          }
          return image;
        });
      } catch (error) {
        try {
          await dependencies.cloudinaryClient.removeImage(uploaded.publicId);
        } catch (cleanupError) {
          dependencies.logger.warn(compensationWarningMessage, {
            operation: "listing-image-upload-compensation",
            listingId: preflight.listingId,
            assetCount: 1,
            errorType: cleanupError instanceof Error ? cleanupError.name : "UnknownError"
          });
        }
        throw error;
      }
    }
  });
}

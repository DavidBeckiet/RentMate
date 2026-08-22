import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "./listing-create-service.js";
import {
  createListingImageOrderRepository,
  type ListingImageOrderRepositoryFactory
} from "../repositories/listing-image-order-repository.js";
import { copyOwnerImage, type OwnerImage } from "../mappers/owner-image-mapper.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const concurrentModificationMessage = "The listing changed during this request.";

export interface ListingImageOrderService {
  readonly reorderOwnedImages: (
    principal: AuthenticatedPrincipal,
    listingId: number,
    imageIds: readonly number[]
  ) => Promise<readonly OwnerImage[]>;
}

interface ListingImageOrderServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingImageOrderRepositoryFactory;
}

function concurrentModification(): ApplicationError {
  return new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
}

function containsExactSet(requested: readonly number[], current: readonly OwnerImage[]): boolean {
  if (requested.length !== current.length) return false;
  const currentIds = new Set(current.map((image) => image.id));
  return (
    currentIds.size === current.length &&
    new Set(requested).size === requested.length &&
    requested.every((id) => currentIds.has(id))
  );
}

function hasSameRelativeOrder(requested: readonly number[], current: readonly OwnerImage[]): boolean {
  return requested.every((id, index) => id === current[index]?.id);
}

function immutableImages(images: readonly OwnerImage[]): readonly OwnerImage[] {
  return Object.freeze(images.map(copyOwnerImage));
}

export function createListingImageOrderService(
  dependencies: ListingImageOrderServiceDependencies
): ListingImageOrderService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingImageOrderRepository;

  return Object.freeze({
    async reorderOwnedImages(
      principal: AuthenticatedPrincipal,
      listingId: number,
      imageIds: readonly number[]
    ): Promise<readonly OwnerImage[]> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      return dependencies.transactionRunner(async (executor: SqlExecutor) => {
        const repository = repositoryFactory(executor);
        const listing = await repository.lockOwnedListing(listingId, principal.userId);
        if (listing === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);

        const currentImages = await repository.findCurrentImages(listingId);
        if (!containsExactSet(imageIds, currentImages)) throw concurrentModification();
        if (hasSameRelativeOrder(imageIds, currentImages)) return immutableImages(currentImages);

        await repository.deferImageOrderUniqueness();
        const reordered = await repository.reorderImages(listingId, imageIds);
        if (reordered === null) throw concurrentModification();
        if (
          !(await repository.touchListingAfterImageReorder({
            listingId,
            landlordId: principal.userId,
            currentStatus: listing.status
          }))
        ) {
          throw concurrentModification();
        }
        return immutableImages(reordered);
      });
    }
  });
}

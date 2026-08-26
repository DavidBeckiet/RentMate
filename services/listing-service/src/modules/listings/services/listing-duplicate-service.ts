import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import {
  createListingDuplicateRepositories,
  type ListingDuplicateSourceRepositoryFactory
} from "../repositories/listing-duplicate-repository.js";
import type { ListingCreateRepositoryFactory } from "../repositories/listing-create-repository.js";
import type { TransactionRunner } from "./listing-create-service.js";
import { createOwnerListing, type OwnerListing } from "../mappers/owner-listing-mapper.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface ListingDuplicateService {
  readonly duplicateListing: (principal: AuthenticatedPrincipal, listingId: number) => Promise<OwnerListing>;
}

interface ListingDuplicateServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly sourceRepositoryFactory?: ListingDuplicateSourceRepositoryFactory;
  readonly createRepositoryFactory?: ListingCreateRepositoryFactory;
}

export function createListingDuplicateService(
  dependencies: ListingDuplicateServiceDependencies
): ListingDuplicateService {
  return Object.freeze({
    async duplicateListing(principal: AuthenticatedPrincipal, listingId: number): Promise<OwnerListing> {
      if (principal.role !== "LANDLORD") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      return dependencies.transactionRunner(async (executor) => {
        const repositories = createListingDuplicateRepositories(
          executor,
          dependencies.sourceRepositoryFactory,
          dependencies.createRepositoryFactory
        );
        const source = await repositories.source.findOwnedSource(listingId, principal.userId);
        if (source === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }

        const created = await repositories.create.insertDraft({
          landlordId: principal.userId,
          propertyTypeId: source.content.propertyTypeId,
          title: source.content.title,
          description: source.content.description,
          monthlyRent: source.content.monthlyRent,
          roomAreaSqm: source.content.roomAreaSqm,
          maxOccupants: source.content.maxOccupants,
          addressText: source.content.addressText,
          areaName: source.content.areaName,
          latitude: source.content.latitude,
          longitude: source.content.longitude
        });

        if (source.amenities.length > 0) {
          await repositories.create.insertListingAmenities(
            created.id,
            source.amenities.map((amenity) => amenity.id)
          );
        }

        return createOwnerListing(created, source.propertyType, source.amenities);
      });
    }
  });
}

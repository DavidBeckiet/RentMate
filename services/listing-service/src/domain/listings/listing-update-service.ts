import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import {
  ApplicationError,
  createValidationError
} from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../shared/src/runtime/shared/types/authentication.js";
import { validationDetail } from "../../../../shared/src/runtime/shared/validation/issues.js";
import type { TransactionRunner } from "./listing-create-service.js";
import { requiresCurrentModerationReason } from "./current-moderation-reason.js";
import {
  createListingUpdateRepository,
  type ListingUpdateRepositoryFactory,
  type UpdateControlledValue
} from "./listing-update-repository.js";
import { resolveListingUpdateState } from "./listing-update-state.js";
import type { ListingUpdateInput } from "./listing-update-validation.js";
import { createOwnerListingDetail, type OwnerListingDetail } from "./owner-listing-mapper.js";
import { createOwnerListingReadRepository, type OwnerListingReadRepository } from "./owner-listing-read-repository.js";

const resourceNotFoundMessage = "The requested resource was not found.";
export interface ListingUpdateService {
  readonly updateOwnedListing: (
    principal: AuthenticatedPrincipal,
    listingId: number,
    input: ListingUpdateInput
  ) => Promise<OwnerListingDetail>;
}
interface ListingUpdateServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ListingUpdateRepositoryFactory;
  readonly ownerReadRepositoryFactory?: (executor: SqlExecutor) => OwnerListingReadRepository;
}

function unavailable(field: "propertyTypeCode" | "amenityCodes"): ApplicationError {
  return createValidationError([
    validationDetail(field, "INVALID_VALUE", `${field} must reference only available values.`)
  ]);
}
function resolveAll(codes: readonly string[], values: readonly UpdateControlledValue[]): boolean {
  const resolved = new Set(values.map((value) => value.code));
  return values.length === codes.length && codes.every((code) => resolved.has(code));
}
async function loadOwnerDetail(
  repository: OwnerListingReadRepository,
  listingId: number,
  landlordId: number
): Promise<OwnerListingDetail> {
  const listing = await repository.findOwnerListingDetailBase(listingId, landlordId);
  if (listing === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
  const amenities = await repository.findAmenitiesForListing(listingId);
  const images = await repository.findImagesForListing(listingId);
  const reason = requiresCurrentModerationReason(listing.status)
    ? await repository.findCurrentModerationReason(listingId, listing.status)
    : null;
  return createOwnerListingDetail(listing, amenities, images, reason);
}

export function createListingUpdateService(dependencies: ListingUpdateServiceDependencies): ListingUpdateService {
  const repositoryFactory = dependencies.repositoryFactory ?? createListingUpdateRepository;
  const readFactory = dependencies.ownerReadRepositoryFactory ?? createOwnerListingReadRepository;
  return Object.freeze({
    async updateOwnedListing(principal: AuthenticatedPrincipal, listingId: number, input: ListingUpdateInput) {
      if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      return dependencies.transactionRunner(async (executor) => {
        const repository = repositoryFactory(executor);
        const current = await repository.lockOwnedListing(listingId, principal.userId);
        if (current === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        const currentAmenities = await repository.findCurrentAmenities(listingId);
        let propertyType = current.propertyType;
        if (input.propertyTypeCode.provided) {
          const code = input.propertyTypeCode.value;
          if (code === null) propertyType = null;
          else if (code !== current.propertyType?.code) {
            propertyType = await repository.findActivePropertyTypeByCode(code);
            if (propertyType === null) throw unavailable("propertyTypeCode");
          }
        }
        let desiredAmenities = currentAmenities;
        if (input.amenityCodes.provided) {
          desiredAmenities = await repository.findAmenitiesByCodes(input.amenityCodes.value);
          if (!resolveAll(input.amenityCodes.value, desiredAmenities)) throw unavailable("amenityCodes");
          const existing = new Set(currentAmenities.map((amenity) => amenity.code));
          if (desiredAmenities.some((amenity) => !amenity.isActive && !existing.has(amenity.code)))
            throw unavailable("amenityCodes");
        }
        const state = resolveListingUpdateState(
          {
            status: current.status,
            title: current.title,
            description: current.description,
            monthlyRent: current.monthlyRent,
            roomAreaSqm: current.roomAreaSqm,
            addressText: current.addressText,
            areaName: current.areaName,
            latitude: current.latitude,
            longitude: current.longitude,
            propertyTypeCode: current.propertyType?.code ?? null,
            amenityCodes: currentAmenities.map((amenity) => amenity.code)
          },
          input
        );
        if (state.changed) {
          const updated = await repository.updateListingContent({
            listingId,
            landlordId: principal.userId,
            expectedStatus: current.status,
            status: state.status,
            propertyTypeId: propertyType?.id ?? null,
            title: state.title,
            description: state.description,
            monthlyRent: state.monthlyRent,
            roomAreaSqm: state.roomAreaSqm,
            addressText: state.addressText,
            areaName: state.areaName,
            latitude: state.latitude,
            longitude: state.longitude
          });
          if (!updated)
            throw new ApplicationError("CONCURRENT_MODIFICATION", "The listing changed during this request.");
          if (state.amenitiesChanged)
            await repository.replaceAmenities(
              listingId,
              desiredAmenities.map((amenity) => amenity.id)
            );
        }
        return loadOwnerDetail(readFactory(executor), listingId, principal.userId);
      });
    }
  });
}

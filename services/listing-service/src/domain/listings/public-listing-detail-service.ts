import { RepositoryInvariantError } from "../../../../shared/src/runtime/db/repository-primitives.js";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../../../shared/src/runtime/shared/types/authentication.js";
import {
  enrichPublicListingDetail,
  type PublicListingDetail,
  type TenantPublicListingDetail
} from "./public-listing-detail-mapper.js";
import type { PublicListingDetailRepository } from "./public-listing-detail-repository.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface PublicListingDetailService {
  readonly getPublicDetail: (
    listingId: number,
    principal?: AuthenticatedPrincipal
  ) => Promise<PublicListingDetail | TenantPublicListingDetail>;
}

export function createPublicListingDetailService(
  repository: PublicListingDetailRepository
): PublicListingDetailService {
  return Object.freeze({
    async getPublicDetail(
      listingId: number,
      principal?: AuthenticatedPrincipal
    ): Promise<PublicListingDetail | TenantPublicListingDetail> {
      const includeContact = principal?.role === "TENANT";
      const result = await repository.findPublicDetailById(listingId, includeContact);
      if (result === null) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
      }

      if (includeContact) {
        if (result.landlordContact === null) {
          throw new RepositoryInvariantError("Active-tenant public detail is missing landlord contact.");
        }
        return enrichPublicListingDetail(result.detail, result.landlordContact);
      }

      if (result.landlordContact !== null) {
        throw new RepositoryInvariantError("Base public detail unexpectedly contains landlord contact.");
      }
      return result.detail;
    }
  });
}

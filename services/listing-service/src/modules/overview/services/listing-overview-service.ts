import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { ListingOverview, ListingOverviewRepository } from "../repositories/listing-overview-repository.js";

export interface ListingOverviewService {
  readonly read: (principal: AuthenticatedPrincipal) => Promise<ListingOverview>;
}

export function createListingOverviewService(repository: ListingOverviewRepository): ListingOverviewService {
  return Object.freeze({
    async read(principal: AuthenticatedPrincipal) {
      if (principal.role !== "ADMIN") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      return repository.read();
    }
  });
}

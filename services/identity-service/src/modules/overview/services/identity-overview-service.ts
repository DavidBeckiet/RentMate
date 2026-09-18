import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { IdentityOverview, IdentityOverviewRepository } from "../repositories/identity-overview-repository.js";

export interface IdentityOverviewService {
  readonly read: (principal: AuthenticatedPrincipal) => Promise<IdentityOverview>;
}

export function createIdentityOverviewService(repository: IdentityOverviewRepository): IdentityOverviewService {
  return Object.freeze({
    async read(principal: AuthenticatedPrincipal) {
      if (principal.role !== "ADMIN") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      return repository.read();
    }
  });
}

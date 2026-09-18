import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type {
  EngagementOverview,
  EngagementOverviewRepository
} from "../repositories/engagement-overview-repository.js";

export interface EngagementOverviewService {
  readonly read: (principal: AuthenticatedPrincipal) => Promise<EngagementOverview>;
}

export function createEngagementOverviewService(repository: EngagementOverviewRepository): EngagementOverviewService {
  return Object.freeze({
    async read(principal: AuthenticatedPrincipal) {
      if (principal.role !== "ADMIN") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      return repository.read();
    }
  });
}

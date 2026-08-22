import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "./listing-create-service.js";
import {
  createModerationActionRepository,
  type ModerationActionRepositoryFactory,
  type ModerationStatusTransition
} from "../repositories/moderation-action-repository.js";
import type { ModerationActionInput } from "../validations/moderation-action-validation.js";
import type { ModerationHistoryItem } from "../mappers/moderation-history-mapper.js";

const resourceNotFoundMessage = "The requested resource was not found.";
const concurrentModificationMessage = "The listing changed during this request.";

const transitions = Object.freeze({
  APPROVE: Object.freeze({ expectedStatus: "PENDING", nextStatus: "APPROVED" }),
  REJECT: Object.freeze({ expectedStatus: "PENDING", nextStatus: "REJECTED" }),
  HIDE: Object.freeze({ expectedStatus: "APPROVED", nextStatus: "HIDDEN" }),
  RESTORE: Object.freeze({ expectedStatus: "HIDDEN", nextStatus: "APPROVED" })
} satisfies Record<ModerationActionInput["action"], ModerationStatusTransition>);

export interface ModerationActionService {
  readonly moderateListing: (
    principal: AuthenticatedPrincipal,
    listingId: number,
    input: ModerationActionInput
  ) => Promise<ModerationHistoryItem>;
}

interface ModerationActionServiceDependencies {
  readonly transactionRunner: TransactionRunner;
  readonly repositoryFactory?: ModerationActionRepositoryFactory;
}

export function createModerationActionService(
  dependencies: ModerationActionServiceDependencies
): ModerationActionService {
  const repositoryFactory = dependencies.repositoryFactory ?? createModerationActionRepository;

  return Object.freeze({
    async moderateListing(
      principal: AuthenticatedPrincipal,
      listingId: number,
      input: ModerationActionInput
    ): Promise<ModerationHistoryItem> {
      if (principal.role !== "ADMIN") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }

      return dependencies.transactionRunner(async (executor) => {
        const repository = repositoryFactory(executor);
        const listing = await repository.lockListing(listingId);
        if (listing === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }

        const transition = transitions[input.action];
        if (listing.status !== transition.expectedStatus) {
          throw new ApplicationError(
            "INVALID_LISTING_TRANSITION",
            "The moderation action is not allowed from the listing's current status."
          );
        }

        if (!(await repository.transitionStatus(listingId, transition))) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", concurrentModificationMessage);
        }

        return repository.insertHistory({
          listingId,
          adminId: principal.userId,
          previousStatus: listing.status,
          newStatus: transition.nextStatus,
          reason: input.reason
        });
      });
    }
  });
}

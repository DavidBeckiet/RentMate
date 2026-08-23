import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { PublicListingSummary } from "../../../../../shared/public-listing-summary.js";
import type { ListingNote, ListingNoteRepository } from "../repositories/listing-note-repository.js";

const notFoundMessage = "The requested resource was not found.";

export interface ListingNoteTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface ListingNoteService {
  readonly list: (principal: AuthenticatedPrincipal, listingIds: readonly number[]) => Promise<readonly ListingNote[]>;
  readonly save: (principal: AuthenticatedPrincipal, listingId: number, note: string) => Promise<ListingNote>;
  readonly remove: (principal: AuthenticatedPrincipal, listingId: number) => Promise<void>;
}

function requireTenant(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "TENANT") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

export function createListingNoteService(dependencies: {
  readonly repository: ListingNoteRepository;
  readonly transactionRunner: ListingNoteTransactionRunner;
  readonly loadPublicSummariesByIds: (listingIds: readonly number[]) => Promise<readonly PublicListingSummary[]>;
}): ListingNoteService {
  const { repository, transactionRunner, loadPublicSummariesByIds } = dependencies;
  return Object.freeze({
    list(principal, listingIds) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run((executor) => repository.list(executor, tenantId, listingIds));
    },

    async save(principal, listingId, note) {
      const tenantId = requireTenant(principal);
      const visible = await loadPublicSummariesByIds(Object.freeze([listingId]));
      if (!visible.some((listing) => listing.id === listingId)) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      }
      return transactionRunner.run(async (executor) => {
        const current = await repository.findForUpdate(executor, tenantId, listingId);
        if (current?.note === note) return current;
        return repository.upsert(executor, tenantId, listingId, note);
      });
    },

    remove(principal, listingId) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run((executor) => repository.remove(executor, tenantId, listingId));
    }
  });
}

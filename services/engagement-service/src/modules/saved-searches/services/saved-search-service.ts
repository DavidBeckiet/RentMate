import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { SavedSearch, SavedSearchRepository } from "../repositories/saved-search-repository.js";
import type {
  CreateSavedSearchInput,
  SavedSearchCollectionQuery,
  UpdateSavedSearchInput
} from "../validations/saved-search-validation.js";

const notFoundMessage = "The requested resource was not found.";

export interface SavedSearchPage {
  readonly data: readonly SavedSearch[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface SavedSearchTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface SavedSearchService {
  readonly create: (principal: AuthenticatedPrincipal, input: CreateSavedSearchInput) => Promise<SavedSearch>;
  readonly list: (principal: AuthenticatedPrincipal, query: SavedSearchCollectionQuery) => Promise<SavedSearchPage>;
  readonly update: (
    principal: AuthenticatedPrincipal,
    id: number,
    input: UpdateSavedSearchInput
  ) => Promise<SavedSearch>;
  readonly remove: (principal: AuthenticatedPrincipal, id: number) => Promise<void>;
}

function requireTenant(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "TENANT") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function sameQuery(left: SavedSearch["query"], right: SavedSearch["query"]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createSavedSearchService(dependencies: {
  readonly repository: SavedSearchRepository;
  readonly transactionRunner: SavedSearchTransactionRunner;
}): SavedSearchService {
  const { repository, transactionRunner } = dependencies;
  const service: SavedSearchService = {
    create(principal, input) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run((executor) => repository.create(executor, tenantId, input));
    },

    async list(principal, query) {
      const tenantId = requireTenant(principal);
      const rows = await transactionRunner.run((executor) =>
        repository.list(executor, tenantId, query.pageSize, query.offset)
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    update(principal, id, input) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        const current = await repository.findForUpdate(executor, tenantId, id);
        if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const merged: CreateSavedSearchInput = {
          name: input.name === undefined ? current.name : input.name,
          isActive: input.isActive === undefined ? current.isActive : input.isActive,
          query: input.query ?? current.query
        };
        if (
          merged.name === current.name &&
          merged.isActive === current.isActive &&
          sameQuery(merged.query, current.query)
        )
          return current;
        return repository.update(executor, tenantId, id, merged);
      });
    },

    remove(principal, id) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        if (!(await repository.remove(executor, tenantId, id))) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        }
      });
    }
  };
  return Object.freeze(service);
}

import type { TransactionRunner } from "../../../shared/transaction.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import {
  createAdminUserRepository,
  type AdminUserRepository,
  type AdminUserRepositoryFactory
} from "../repositories/admin-user-repository.js";
import type { AdminUserActivationInput, AdminUserCollectionQuery } from "../validations/admin-user-validation.js";
import type { AdminUserDetail, UserProfile } from "../user-profile.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface PaginatedAdminUsers {
  readonly users: readonly UserProfile[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface AdminUserService {
  readonly listUsers: (
    principal: AuthenticatedPrincipal,
    query: AdminUserCollectionQuery
  ) => Promise<PaginatedAdminUsers>;
  readonly getUser: (principal: AuthenticatedPrincipal, userId: number) => Promise<AdminUserDetail>;
  readonly setActivation: (
    principal: AuthenticatedPrincipal,
    userId: number,
    input: AdminUserActivationInput
  ) => Promise<UserProfile>;
}

interface AdminUserServiceDependencies {
  readonly repository: AdminUserRepository;
  readonly transactionRunner: TransactionRunner;
  readonly transactionRepositoryFactory?: AdminUserRepositoryFactory;
}

function requireAdmin(principal: AuthenticatedPrincipal): void {
  if (principal.role !== "ADMIN") {
    throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  }
}

export function createAdminUserService(dependencies: AdminUserServiceDependencies): AdminUserService {
  const transactionRepositoryFactory = dependencies.transactionRepositoryFactory ?? createAdminUserRepository;

  return Object.freeze({
    async listUsers(principal: AuthenticatedPrincipal, query: AdminUserCollectionQuery): Promise<PaginatedAdminUsers> {
      requireAdmin(principal);
      const rows = await dependencies.repository.findUserPage({
        q: query.q,
        userId: query.userId,
        role: query.role,
        isActive: query.isActive,
        limit: query.pageSize + 1,
        offset: query.offset
      });
      return Object.freeze({
        users: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async getUser(principal: AuthenticatedPrincipal, userId: number): Promise<AdminUserDetail> {
      requireAdmin(principal);
      const user = await dependencies.repository.findUserDetail(userId);
      if (user === null) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
      }
      return user;
    },

    async setActivation(
      principal: AuthenticatedPrincipal,
      userId: number,
      input: AdminUserActivationInput
    ): Promise<UserProfile> {
      requireAdmin(principal);
      return dependencies.transactionRunner(async (executor) => {
        const repository = transactionRepositoryFactory(executor);
        const target = await repository.lockActivationTarget(userId);
        if (target === null) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
        }
        if (target.role === "ADMIN") {
          throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
        }
        if (target.isActive === input.isActive) {
          return target;
        }
        return repository.updateActivation({ userId, isActive: input.isActive, lockedRole: target.role });
      });
    }
  });
}

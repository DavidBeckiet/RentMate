import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { IdentityAccountClient, IdentityUserProfile } from "../../../../../shared/identity-account-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { SupportRepository, SupportRequest } from "../repositories/support-repository.js";
import type {
  CreateSupportRequestInput,
  SupportRequestCollectionQuery,
  SupportRequestStatus,
  UpdateSupportRequestStatusInput
} from "../validations/support-validation.js";

const notFoundMessage = "The requested support request was not found.";

export interface SupportPage<Value> {
  readonly data: readonly Value[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface AdminSupportRequest extends SupportRequest {
  readonly requester: Pick<IdentityUserProfile, "id" | "role" | "email" | "isActive">;
}

export interface SupportTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface SupportService {
  readonly create: (principal: AuthenticatedPrincipal, input: CreateSupportRequestInput) => Promise<SupportRequest>;
  readonly listAdmin: (
    principal: AuthenticatedPrincipal,
    query: SupportRequestCollectionQuery
  ) => Promise<SupportPage<AdminSupportRequest>>;
  readonly getAdmin: (principal: AuthenticatedPrincipal, supportRequestId: number) => Promise<AdminSupportRequest>;
  readonly updateAdmin: (
    principal: AuthenticatedPrincipal,
    supportRequestId: number,
    input: UpdateSupportRequestStatusInput
  ) => Promise<AdminSupportRequest>;
}

function requireAdmin(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "ADMIN") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function allowedTransition(current: SupportRequestStatus, next: SupportRequestStatus): boolean {
  return (
    (current === "OPEN" && (next === "IN_PROGRESS" || next === "RESOLVED")) ||
    (current === "IN_PROGRESS" && next === "RESOLVED")
  );
}

function requesterProfile(
  request: SupportRequest,
  profiles: readonly IdentityUserProfile[]
): Pick<IdentityUserProfile, "id" | "role" | "email" | "isActive"> {
  const profile = profiles.find((candidate) => candidate.id === request.requesterId);
  if (!profile) throw new Error("Identity service support requester profile is missing.");
  return Object.freeze({ id: profile.id, role: profile.role, email: profile.email, isActive: profile.isActive });
}

export function createSupportService(dependencies: {
  readonly repository: SupportRepository;
  readonly identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds">;
  readonly transactionRunner: SupportTransactionRunner;
}): SupportService {
  const { repository, identityAccountClient, transactionRunner } = dependencies;

  const enrich = async (requests: readonly SupportRequest[]): Promise<readonly AdminSupportRequest[]> => {
    const profiles = await identityAccountClient.loadProfilesByIds([
      ...new Set(requests.map((request) => request.requesterId))
    ]);
    return Object.freeze(
      requests.map((request) => Object.freeze({ ...request, requester: requesterProfile(request, profiles) }))
    );
  };

  const service: SupportService = {
    async create(principal, input) {
      return transactionRunner.run((executor) => repository.create(executor, principal.userId, principal.role, input));
    },

    async listAdmin(principal, query) {
      requireAdmin(principal);
      const rows = await transactionRunner.run((executor) =>
        repository.list(executor, { status: query.status, limit: query.pageSize + 1, offset: query.offset })
      );
      const pageRows = rows.slice(0, query.pageSize);
      return Object.freeze({
        data: await enrich(pageRows),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async getAdmin(principal, supportRequestId) {
      requireAdmin(principal);
      const request = await transactionRunner.run((executor) => repository.findById(executor, supportRequestId));
      if (!request) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      const [enriched] = await enrich([request]);
      if (!enriched) throw new Error("Support request enrichment failed.");
      return enriched;
    },

    async updateAdmin(principal, supportRequestId, input) {
      const adminId = requireAdmin(principal);
      const updated = await transactionRunner.run(async (executor) => {
        const current = await repository.findById(executor, supportRequestId, true);
        if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (!allowedTransition(current.status, input.status)) {
          throw new ApplicationError(
            "CONCURRENT_MODIFICATION",
            "The support request status transition is not allowed."
          );
        }
        return repository.updateStatus(executor, supportRequestId, input.status, adminId, input.note);
      });
      const [enriched] = await enrich([updated]);
      if (!enriched) throw new Error("Support request enrichment failed.");
      return enriched;
    }
  };
  return Object.freeze(service);
}

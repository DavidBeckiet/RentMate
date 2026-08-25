import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "../../../shared/transaction.js";
import type { LandlordVerification, VerificationRepository } from "../repositories/verification-repository.js";
import type {
  CreateVerificationInput,
  ReviewVerificationInput,
  VerificationCollectionQuery
} from "../validations/verification-validation.js";

const notFoundMessage = "The requested resource was not found.";
const blockingMessage = "A pending or approved verification already exists for this landlord.";
const contactsRequiredMessage = "Email and phone verification are required before submitting a landlord profile.";
const staleMessage = "The verification decision is no longer allowed from its current state.";

export interface VerificationPage {
  readonly data: readonly LandlordVerification[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}
export interface VerificationService {
  readonly create: (principal: AuthenticatedPrincipal, input: CreateVerificationInput) => Promise<LandlordVerification>;
  readonly current: (principal: AuthenticatedPrincipal) => Promise<LandlordVerification | null>;
  readonly list: (principal: AuthenticatedPrincipal, query: VerificationCollectionQuery) => Promise<VerificationPage>;
  readonly get: (principal: AuthenticatedPrincipal, verificationId: number) => Promise<LandlordVerification>;
  readonly review: (
    principal: AuthenticatedPrincipal,
    verificationId: number,
    input: ReviewVerificationInput
  ) => Promise<LandlordVerification>;
}

function requireRole(principal: AuthenticatedPrincipal, role: "LANDLORD" | "ADMIN"): number {
  if (principal.role !== role) throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}
function mapUniqueConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", blockingMessage, { cause: error });
  }
  throw error;
}

export function createVerificationService(dependencies: {
  readonly repository: VerificationRepository;
  readonly transactionRunner: TransactionRunner;
}): VerificationService {
  const { repository, transactionRunner } = dependencies;
  const service: VerificationService = {
    async create(principal, input) {
      const landlordId = requireRole(principal, "LANDLORD");
      try {
        return await transactionRunner(async (executor) => {
          if (!(await repository.hasVerifiedContacts(executor, landlordId))) {
            throw new ApplicationError("VALIDATION_FAILED", contactsRequiredMessage);
          }
          if ((await repository.findBlockingForLandlord(executor, landlordId)) !== null) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", blockingMessage);
          }
          return repository.create(executor, landlordId, input);
        });
      } catch (error) {
        return mapUniqueConflict(error);
      }
    },
    current(principal) {
      const landlordId = requireRole(principal, "LANDLORD");
      return transactionRunner((executor) => repository.findLatestForLandlord(executor, landlordId));
    },
    async list(principal, query) {
      requireRole(principal, "ADMIN");
      const rows = await transactionRunner((executor) =>
        repository.list(executor, { status: query.status, limit: query.pageSize + 1, offset: query.offset })
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },
    async get(principal, verificationId) {
      requireRole(principal, "ADMIN");
      const verification = await transactionRunner((executor) => repository.findById(executor, verificationId));
      if (verification === null) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      return verification;
    },
    async review(principal, verificationId, input) {
      const adminId = requireRole(principal, "ADMIN");
      return transactionRunner(async (executor) => {
        const current = await repository.findById(executor, verificationId, true);
        if (current === null) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (current.status !== "PENDING") throw new ApplicationError("CONCURRENT_MODIFICATION", staleMessage);
        return repository.review(executor, verificationId, input.status, input.note, adminId);
      });
    }
  };
  return Object.freeze(service);
}

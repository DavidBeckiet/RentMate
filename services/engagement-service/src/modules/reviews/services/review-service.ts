import type { ListingCatalogClient } from "../../../../../shared/listing-catalog-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { ListingReview, ReviewRepository } from "../repositories/review-repository.js";
import type {
  AdminReviewCollectionQuery,
  CreateReviewInput,
  ModerateReviewInput,
  ReviewCollectionQuery
} from "../validations/review-validation.js";

const notFoundMessage = "The requested resource was not found.";
const duplicateMessage = "A review already exists for this inquiry.";
const staleMessage = "The review moderation decision is no longer allowed.";

export interface ReviewTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}
export interface ReviewEligibility {
  readonly eligible: boolean;
  readonly reason: "INQUIRY_OPEN" | "NO_LANDLORD_REPLY" | "ALREADY_REVIEWED" | null;
  readonly review: ListingReview | null;
}
export interface ReviewPage {
  readonly data: readonly ListingReview[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}
export interface ReviewService {
  readonly eligibility: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<ReviewEligibility>;
  readonly create: (
    principal: AuthenticatedPrincipal,
    inquiryId: number,
    input: CreateReviewInput
  ) => Promise<ListingReview>;
  readonly listPublic: (listingId: number, query: ReviewCollectionQuery) => Promise<ReviewPage>;
  readonly listAdmin: (principal: AuthenticatedPrincipal, query: AdminReviewCollectionQuery) => Promise<ReviewPage>;
  readonly getAdmin: (principal: AuthenticatedPrincipal, reviewId: number) => Promise<ListingReview>;
  readonly moderate: (
    principal: AuthenticatedPrincipal,
    reviewId: number,
    input: ModerateReviewInput
  ) => Promise<ListingReview>;
}

function requireRole(principal: AuthenticatedPrincipal, role: "TENANT" | "ADMIN"): number {
  if (principal.role !== role) throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}
function mapDuplicate(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", duplicateMessage, { cause: error });
  }
  throw error;
}

export function createReviewService(dependencies: {
  readonly repository: ReviewRepository;
  readonly transactionRunner: ReviewTransactionRunner;
  readonly listingCatalogClient: Pick<ListingCatalogClient, "loadPublicSummariesByIds">;
}): ReviewService {
  const { repository, transactionRunner, listingCatalogClient } = dependencies;
  const service: ReviewService = {
    async eligibility(principal, inquiryId) {
      const tenantId = requireRole(principal, "TENANT");
      return transactionRunner.run(async (executor) => {
        const context = await repository.findInquiryContext(executor, inquiryId);
        if (!context || context.tenantId !== tenantId)
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const review = await repository.findByInquiryId(executor, inquiryId);
        if (review) return Object.freeze({ eligible: false, reason: "ALREADY_REVIEWED", review });
        if (context.status !== "CLOSED") {
          return Object.freeze({ eligible: false, reason: "INQUIRY_OPEN", review: null });
        }
        if (!context.hasLandlordReply) {
          return Object.freeze({ eligible: false, reason: "NO_LANDLORD_REPLY", review: null });
        }
        return Object.freeze({ eligible: true, reason: null, review: null });
      });
    },
    async create(principal, inquiryId, input) {
      const tenantId = requireRole(principal, "TENANT");
      try {
        return await transactionRunner.run(async (executor) => {
          const context = await repository.findInquiryContext(executor, inquiryId, true);
          if (!context || context.tenantId !== tenantId)
            throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          if (context.status !== "CLOSED" || !context.hasLandlordReply) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", "This inquiry is not eligible for review.");
          }
          if ((await repository.findByInquiryId(executor, inquiryId)) !== null) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", duplicateMessage);
          }
          return repository.create(executor, context, input);
        });
      } catch (error) {
        return mapDuplicate(error);
      }
    },
    async listPublic(listingId, query) {
      const visible = await listingCatalogClient.loadPublicSummariesByIds([listingId]);
      if (!visible.some((listing) => listing.id === listingId)) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      }
      const rows = await transactionRunner.run((executor) =>
        repository.listPublic(executor, listingId, query.pageSize + 1, query.offset)
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },
    async listAdmin(principal, query) {
      requireRole(principal, "ADMIN");
      const rows = await transactionRunner.run((executor) =>
        repository.listAdmin(executor, query.status, query.pageSize + 1, query.offset)
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },
    async getAdmin(principal, reviewId) {
      requireRole(principal, "ADMIN");
      const review = await transactionRunner.run((executor) => repository.findById(executor, reviewId));
      if (!review) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      return review;
    },
    async moderate(principal, reviewId, input) {
      const adminId = requireRole(principal, "ADMIN");
      return transactionRunner.run(async (executor) => {
        const current = await repository.findById(executor, reviewId, true);
        if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (current.status !== "PENDING") throw new ApplicationError("CONCURRENT_MODIFICATION", staleMessage);
        return repository.moderate(executor, reviewId, input.status, input.note, adminId);
      });
    }
  };
  return Object.freeze(service);
}

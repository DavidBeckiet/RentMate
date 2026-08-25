import type { ListingCatalogClient } from "../../../../../shared/listing-catalog-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { ListingReview, ReviewRepository } from "../repositories/review-repository.js";
import type {
  ReviewReport,
  ReviewReportEvent,
  ReviewReportRepository
} from "../repositories/review-report-repository.js";
import type {
  AdminReviewCollectionQuery,
  CreateReviewInput,
  ModerateReviewInput,
  ReviewCollectionQuery,
  CreateReviewReportInput,
  ReviewReportCollectionQuery,
  ReviewReportStatus,
  UpdateReviewReportStatusInput
} from "../validations/review-validation.js";

const notFoundMessage = "The requested resource was not found.";
const duplicateMessage = "A review already exists for this inquiry.";
const staleMessage = "The review moderation decision is no longer allowed.";
const duplicateReportMessage = "You already have an active report for this review.";

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
export interface ReviewReportPage {
  readonly data: readonly ReviewReport[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}
export interface ReviewReportDetail extends ReviewReport {
  readonly events: readonly ReviewReportEvent[];
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
  readonly createReport: (
    principal: AuthenticatedPrincipal,
    reviewId: number,
    input: CreateReviewReportInput
  ) => Promise<ReviewReport>;
  readonly listAdminReports: (
    principal: AuthenticatedPrincipal,
    query: ReviewReportCollectionQuery
  ) => Promise<ReviewReportPage>;
  readonly getAdminReport: (principal: AuthenticatedPrincipal, reportId: number) => Promise<ReviewReportDetail>;
  readonly moderateReport: (
    principal: AuthenticatedPrincipal,
    reportId: number,
    input: UpdateReviewReportStatusInput
  ) => Promise<ReviewReportDetail>;
}

function requireRole(principal: AuthenticatedPrincipal, role: "TENANT" | "ADMIN"): number {
  if (principal.role !== role) throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}
function requireReportRole(principal: AuthenticatedPrincipal): "TENANT" | "LANDLORD" {
  if (principal.role !== "TENANT" && principal.role !== "LANDLORD") {
    throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  }
  return principal.role;
}
function mapDuplicate(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", duplicateMessage, { cause: error });
  }
  throw error;
}

function mapDuplicateReport(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", duplicateReportMessage, { cause: error });
  }
  throw error;
}

function allowedReportTransition(current: ReviewReportStatus, next: ReviewReportStatus): boolean {
  return (
    (current === "OPEN" && (next === "INVESTIGATING" || next === "DISMISSED")) ||
    (current === "INVESTIGATING" && next === "RESOLVED")
  );
}

export function createReviewService(dependencies: {
  readonly repository: ReviewRepository;
  readonly reviewReportRepository: ReviewReportRepository;
  readonly transactionRunner: ReviewTransactionRunner;
  readonly listingCatalogClient: Pick<ListingCatalogClient, "loadPublicSummariesByIds">;
}): ReviewService {
  const { repository, reviewReportRepository, transactionRunner, listingCatalogClient } = dependencies;
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
    },
    async createReport(principal, reviewId, input) {
      const actorRole = requireReportRole(principal);
      try {
        return await transactionRunner.run(async (executor) => {
          const target = await reviewReportRepository.findReportableReview(executor, reviewId);
          if (!target || target.tenantId === principal.userId) {
            throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          }
          const report = await reviewReportRepository.create(executor, reviewId, principal.userId, input);
          await reviewReportRepository.appendEvent(executor, {
            reportId: report.id,
            actorId: principal.userId,
            actorRole,
            previousStatus: null,
            newStatus: "OPEN",
            note: input.details
          });
          return report;
        });
      } catch (error) {
        return mapDuplicateReport(error);
      }
    },
    async listAdminReports(principal, query) {
      requireRole(principal, "ADMIN");
      const rows = await transactionRunner.run((executor) =>
        reviewReportRepository.list(executor, {
          status: query.status,
          category: query.category,
          limit: query.pageSize + 1,
          offset: query.offset
        })
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },
    async getAdminReport(principal, reportId) {
      requireRole(principal, "ADMIN");
      const result = await transactionRunner.run(async (executor) => {
        const report = await reviewReportRepository.findById(executor, reportId);
        if (!report) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        return { report, events: await reviewReportRepository.listEvents(executor, reportId) };
      });
      return Object.freeze({ ...result.report, events: result.events });
    },
    async moderateReport(principal, reportId, input) {
      const adminId = requireRole(principal, "ADMIN");
      const result = await transactionRunner.run(async (executor) => {
        const current = await reviewReportRepository.findById(executor, reportId, true);
        if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (!allowedReportTransition(current.status, input.status)) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", "The review report status transition is not allowed.");
        }
        const report = await reviewReportRepository.updateStatus(executor, reportId, input.status, adminId, input.note);
        await reviewReportRepository.appendEvent(executor, {
          reportId,
          actorId: adminId,
          actorRole: "ADMIN",
          previousStatus: current.status,
          newStatus: input.status,
          note: input.note
        });
        return { report, events: await reviewReportRepository.listEvents(executor, reportId) };
      });
      return Object.freeze({ ...result.report, events: result.events });
    }
  };
  return Object.freeze(service);
}

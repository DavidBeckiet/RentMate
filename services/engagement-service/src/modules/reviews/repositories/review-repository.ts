import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type { CreateReviewInput, ReviewStatus } from "../validations/review-validation.js";

export interface ListingReview {
  readonly id: number;
  readonly inquiryId: number;
  readonly listingId: number;
  readonly tenantId: number;
  readonly overallRating: number;
  readonly accuracyRating: number;
  readonly responsivenessRating: number;
  readonly comment: string;
  readonly status: ReviewStatus;
  readonly moderationNote: string | null;
  readonly reviewedByAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewedAt: string | null;
  readonly hasReported: boolean;
}
export interface ReviewInquiryContext {
  readonly id: number;
  readonly tenantId: number;
  readonly listingId: number;
  readonly status: "NEW" | "CONTACTED" | "CLOSED";
  readonly hasLandlordReply: boolean;
}

interface ReviewRow extends QueryResultRow {
  id: unknown;
  inquiry_id: unknown;
  listing_id: unknown;
  tenant_id: unknown;
  overall_rating: unknown;
  accuracy_rating: unknown;
  responsiveness_rating: unknown;
  comment: unknown;
  status: unknown;
  moderation_note: unknown;
  reviewed_by_admin_id: unknown;
  created_at: unknown;
  updated_at: unknown;
  reviewed_at: unknown;
  has_reported?: unknown;
}
interface InquiryContextRow extends QueryResultRow {
  id: unknown;
  tenant_id: unknown;
  listing_id: unknown;
  status: unknown;
  has_landlord_reply: unknown;
}

const reviewProjection = `
  id, inquiry_id, listing_id, tenant_id, overall_rating, accuracy_rating,
  responsiveness_rating, comment, status, moderation_note, reviewed_by_admin_id,
  created_at, updated_at, reviewed_at
`;

function id(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}
function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : id(value, field);
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value;
}
function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field);
}
function timestamp(value: unknown, field: string): string {
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}
function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}
function rating(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as number;
}
function isStatus(value: unknown): value is ReviewStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}
function hasReported(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new RepositoryInvariantError("Review report projection is invalid.");
  return value;
}
function mapReview(row: Readonly<ReviewRow>): ListingReview {
  if (!isStatus(row.status)) throw new RepositoryInvariantError("Listing review representation is invalid.");
  return Object.freeze({
    id: id(row.id, "review.id"),
    inquiryId: id(row.inquiry_id, "review.inquiryId"),
    listingId: id(row.listing_id, "review.listingId"),
    tenantId: id(row.tenant_id, "review.tenantId"),
    overallRating: rating(row.overall_rating, "review.overallRating"),
    accuracyRating: rating(row.accuracy_rating, "review.accuracyRating"),
    responsivenessRating: rating(row.responsiveness_rating, "review.responsivenessRating"),
    comment: text(row.comment, "review.comment"),
    status: row.status,
    moderationNote: nullableText(row.moderation_note, "review.moderationNote"),
    reviewedByAdminId: nullableId(row.reviewed_by_admin_id, "review.reviewedByAdminId"),
    createdAt: timestamp(row.created_at, "review.createdAt"),
    updatedAt: timestamp(row.updated_at, "review.updatedAt"),
    reviewedAt: nullableTimestamp(row.reviewed_at, "review.reviewedAt"),
    hasReported: hasReported(row.has_reported)
  });
}
function mapContext(row: Readonly<InquiryContextRow>): ReviewInquiryContext {
  if (
    (row.status !== "NEW" && row.status !== "CONTACTED" && row.status !== "CLOSED") ||
    typeof row.has_landlord_reply !== "boolean"
  ) {
    throw new RepositoryInvariantError("Review inquiry context is invalid.");
  }
  return Object.freeze({
    id: id(row.id, "inquiry.id"),
    tenantId: id(row.tenant_id, "inquiry.tenantId"),
    listingId: id(row.listing_id, "inquiry.listingId"),
    status: row.status as ReviewInquiryContext["status"],
    hasLandlordReply: row.has_landlord_reply
  });
}

export interface ReviewRepository {
  readonly findInquiryContext: (
    executor: SqlExecutor,
    inquiryId: number,
    forUpdate?: boolean
  ) => Promise<ReviewInquiryContext | null>;
  readonly findByInquiryId: (executor: SqlExecutor, inquiryId: number) => Promise<ListingReview | null>;
  readonly create: (
    executor: SqlExecutor,
    context: ReviewInquiryContext,
    input: CreateReviewInput
  ) => Promise<ListingReview>;
  readonly listPublic: (
    executor: SqlExecutor,
    listingId: number,
    limit: number,
    offset: number,
    reporterId?: number
  ) => Promise<readonly ListingReview[]>;
  readonly listAdmin: (
    executor: SqlExecutor,
    status: ReviewStatus,
    limit: number,
    offset: number
  ) => Promise<readonly ListingReview[]>;
  readonly findById: (executor: SqlExecutor, reviewId: number, forUpdate?: boolean) => Promise<ListingReview | null>;
  readonly moderate: (
    executor: SqlExecutor,
    reviewId: number,
    status: Exclude<ReviewStatus, "PENDING">,
    note: string,
    adminId: number
  ) => Promise<ListingReview>;
}

export function createReviewRepository(): ReviewRepository {
  const repository: ReviewRepository = {
    findInquiryContext(executor, inquiryId, forUpdate = false) {
      return queryOptional<InquiryContextRow, ReviewInquiryContext>(
        executor,
        {
          text: `SELECT i.id, i.tenant_id, i.listing_id, i.status,
            EXISTS (SELECT 1 FROM inquiry_messages AS m WHERE m.inquiry_id = i.id AND m.sender_role = 'LANDLORD') AS has_landlord_reply
            FROM listing_inquiries AS i WHERE i.id = $1 ${forUpdate ? "FOR UPDATE OF i" : ""}`,
          values: [inquiryId]
        },
        mapContext
      );
    },
    findByInquiryId(executor, inquiryId) {
      return queryOptional<ReviewRow, ListingReview>(
        executor,
        { text: `SELECT ${reviewProjection} FROM listing_reviews WHERE inquiry_id = $1`, values: [inquiryId] },
        mapReview
      );
    },
    create(executor, context, input) {
      return queryExactlyOne<ReviewRow, ListingReview>(
        executor,
        {
          text: `INSERT INTO listing_reviews
            (inquiry_id, listing_id, tenant_id, overall_rating, accuracy_rating, responsiveness_rating, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${reviewProjection}`,
          values: [
            context.id,
            context.listingId,
            context.tenantId,
            input.overallRating,
            input.accuracyRating,
            input.responsivenessRating,
            input.comment
          ]
        },
        mapReview
      );
    },
    listPublic(executor, listingId, limit, offset, reporterId) {
      return queryMany<ReviewRow, ListingReview>(
        executor,
        {
          text: `SELECT ${reviewProjection}, ${reporterId === undefined ? "false" : "EXISTS (SELECT 1 FROM review_reports AS report WHERE report.review_id = listing_reviews.id AND report.reporter_id = $4)"} AS has_reported FROM listing_reviews WHERE listing_id = $1 AND status = 'APPROVED' ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
          values: reporterId === undefined ? [listingId, limit, offset] : [listingId, limit, offset, reporterId]
        },
        mapReview
      );
    },
    listAdmin(executor, status, limit, offset) {
      return queryMany<ReviewRow, ListingReview>(
        executor,
        {
          text: `SELECT ${reviewProjection} FROM listing_reviews WHERE status = $1 ORDER BY created_at ASC, id ASC LIMIT $2 OFFSET $3`,
          values: [status, limit, offset]
        },
        mapReview
      );
    },
    findById(executor, reviewId, forUpdate = false) {
      return queryOptional<ReviewRow, ListingReview>(
        executor,
        {
          text: `SELECT ${reviewProjection} FROM listing_reviews WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [reviewId]
        },
        mapReview
      );
    },
    moderate(executor, reviewId, status, note, adminId) {
      return queryExactlyOne<ReviewRow, ListingReview>(
        executor,
        {
          text: `UPDATE listing_reviews SET status = $2, moderation_note = $3, reviewed_by_admin_id = $4,
            reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'PENDING' RETURNING ${reviewProjection}`,
          values: [reviewId, status, note, adminId]
        },
        mapReview
      );
    }
  };
  return Object.freeze(repository);
}

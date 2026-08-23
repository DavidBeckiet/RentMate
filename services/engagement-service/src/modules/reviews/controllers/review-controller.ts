import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { ListingReview } from "../repositories/review-repository.js";
import type { ReviewService } from "../services/review-service.js";
import {
  parseReviewId,
  validateAdminReviewQuery,
  validateCreateReviewBody,
  validateModerateReviewBody,
  validatePublicReviewQuery
} from "../validations/review-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function ownReviewDto(review: ListingReview) {
  return {
    id: review.id,
    inquiryId: review.inquiryId,
    listingId: review.listingId,
    overallRating: review.overallRating,
    accuracyRating: review.accuracyRating,
    responsivenessRating: review.responsivenessRating,
    comment: review.comment,
    status: review.status,
    moderationNote: review.moderationNote,
    createdAt: review.createdAt,
    reviewedAt: review.reviewedAt
  };
}

function publicReviewDto(review: ListingReview) {
  return {
    id: review.id,
    overallRating: review.overallRating,
    accuracyRating: review.accuracyRating,
    responsivenessRating: review.responsivenessRating,
    comment: review.comment,
    createdAt: review.createdAt,
    verifiedInteraction: true as const
  };
}

function adminReviewDto(review: ListingReview) {
  return {
    ...ownReviewDto(review),
    tenantId: review.tenantId,
    reviewedByAdminId: review.reviewedByAdminId,
    updatedAt: review.updatedAt
  };
}

export function createGetReviewEligibilityHandler(service: ReviewService): RequestHandler {
  return (request, response, next) => {
    void service
      .eligibility(principal(request), parseReviewId(request.params.inquiryId, "inquiryId"))
      .then((result) =>
        sendObject(response, {
          eligible: result.eligible,
          reason: result.reason,
          review: result.review ? ownReviewDto(result.review) : null
        })
      )
      .catch(next);
  };
}

export function createCreateReviewHandler(service: ReviewService): RequestHandler {
  return (request, response, next) => {
    void service
      .create(
        principal(request),
        parseReviewId(request.params.inquiryId, "inquiryId"),
        validateCreateReviewBody(request.body)
      )
      .then((review) => sendObject(response, ownReviewDto(review), 201))
      .catch(next);
  };
}

export function createListPublicReviewsHandler(service: ReviewService): RequestHandler {
  return (request, response, next) => {
    void service
      .listPublic(parseReviewId(request.params.listingId, "listingId"), validatePublicReviewQuery(request.query))
      .then((page) => sendPaginated(response, page.data.map(publicReviewDto), page))
      .catch(next);
  };
}

export function createListAdminReviewsHandler(service: ReviewService): RequestHandler {
  return (request, response, next) => {
    void service
      .listAdmin(principal(request), validateAdminReviewQuery(request.query))
      .then((page) => sendPaginated(response, page.data.map(adminReviewDto), page))
      .catch(next);
  };
}

export function createGetAdminReviewHandler(service: ReviewService): RequestHandler {
  return (request, response, next) => {
    void service
      .getAdmin(principal(request), parseReviewId(request.params.reviewId))
      .then((review) => sendObject(response, adminReviewDto(review)))
      .catch(next);
  };
}

export function createModerateReviewHandler(service: ReviewService): RequestHandler {
  return (request, response, next) => {
    void service
      .moderate(principal(request), parseReviewId(request.params.reviewId), validateModerateReviewBody(request.body))
      .then((review) => sendObject(response, adminReviewDto(review)))
      .catch(next);
  };
}

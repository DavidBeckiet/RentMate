import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { ListingReport, ReportEvent } from "../repositories/report-repository.js";
import type { AdminReport, AdminReportDetail, ReportService } from "../services/report-service.js";
import {
  parseReportId,
  validateCreateReportBody,
  validateReportCollectionQuery,
  validateUpdateReportStatusBody
} from "../validations/report-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}
function parseListingId(value: string | string[]): number {
  if (typeof value !== "string")
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  return parsePathId(value, "listingId");
}
function receipt(report: ListingReport) {
  return {
    id: report.id,
    listingId: report.listing.id,
    category: report.category,
    status: report.status,
    createdAt: report.createdAt
  };
}
function eventDto(event: ReportEvent) {
  return {
    id: event.id,
    actorId: event.actorId,
    actorRole: event.actorRole,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    note: event.note,
    createdAt: event.createdAt
  };
}
function adminDto(report: AdminReport) {
  return {
    id: report.id,
    listing: report.listing,
    reporter: { id: report.reporter.id, email: report.reporter.email, isActive: report.reporter.isActive },
    category: report.category,
    details: report.details,
    status: report.status,
    resolutionNote: report.resolutionNote,
    assignedAdminId: report.assignedAdminId,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    resolvedAt: report.resolvedAt
  };
}
function detailDto(report: AdminReportDetail) {
  return { ...adminDto(report), events: report.events.map(eventDto) };
}

export function createReportHandler(service: ReportService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        receipt(
          await service.create(
            principal(request),
            parseListingId(request.params.listingId),
            validateCreateReportBody(request.body)
          )
        ),
        201
      );
    })().catch(next);
  };
}
export function listReportsHandler(service: ReportService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const page = await service.list(principal(request), validateReportCollectionQuery(request.query));
      sendPaginated(response, page.data.map(adminDto), page);
    })().catch(next);
  };
}
export function getReportHandler(service: ReportService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(response, detailDto(await service.get(principal(request), parseReportId(request.params.reportId))));
    })().catch(next);
  };
}
export function updateReportStatusHandler(service: ReportService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(
        response,
        detailDto(
          await service.updateStatus(
            principal(request),
            parseReportId(request.params.reportId),
            validateUpdateReportStatusBody(request.body)
          )
        )
      );
    })().catch(next);
  };
}

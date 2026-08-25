import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { ListingCatalogClient } from "../../../../../shared/listing-catalog-client.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { AnalyticsRepository, LandlordAnalyticsSnapshot } from "../repositories/analytics-repository.js";
import type { AnalyticsPeriod, AnalyticsQuery, TrackAnalyticsEventInput } from "../validations/analytics-validation.js";

export interface LandlordAnalytics extends LandlordAnalyticsSnapshot {
  readonly period: AnalyticsPeriod;
  readonly responseRate: number;
  readonly responseWithin24HoursRate: number;
}

export interface AnalyticsService {
  readonly get: (principal: AuthenticatedPrincipal, query: AnalyticsQuery) => Promise<LandlordAnalytics>;
  readonly trackEvent: (
    principal: AuthenticatedPrincipal | undefined,
    listingId: number,
    input: TrackAnalyticsEventInput
  ) => Promise<void>;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1_000) / 10;
}

export function createAnalyticsService(dependencies: {
  readonly repository: AnalyticsRepository;
  readonly listingCatalogClient: Pick<ListingCatalogClient, "loadPublicInquiryTarget">;
  readonly transactionRunner: {
    readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
  };
}): AnalyticsService {
  const service: AnalyticsService = {
    async get(principal, query) {
      if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      const snapshot = await dependencies.transactionRunner.run((executor) =>
        dependencies.repository.load(executor, principal.userId, query.days)
      );
      return Object.freeze({
        ...snapshot,
        period: query.period,
        responseRate: percentage(snapshot.respondedInquiries, snapshot.inquiries),
        responseWithin24HoursRate: percentage(snapshot.respondedWithin24Hours, snapshot.inquiries)
      });
    },
    async trackEvent(principal, listingId, input) {
      if (input.eventType === "FAVORITE" && principal?.role !== "TENANT") {
        throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
      }
      const target = await dependencies.listingCatalogClient.loadPublicInquiryTarget(listingId);
      if (!target) throw new ApplicationError("RESOURCE_NOT_FOUND", "The requested resource was not found.");
      await dependencies.transactionRunner.run((executor) =>
        dependencies.repository.recordEvent(executor, {
          listingId,
          landlordId: target.landlordId,
          actorId: principal?.userId ?? null,
          eventType: input.eventType
        })
      );
    }
  };
  return Object.freeze(service);
}

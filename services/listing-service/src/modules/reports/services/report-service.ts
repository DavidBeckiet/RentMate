import type { IdentityAccountClient, IdentityUserProfile } from "../../../../../shared/identity-account-client.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "../../listings/services/listing-create-service.js";
import type { ListingReport, ReportEvent, ReportRepository } from "../repositories/report-repository.js";
import type {
  CreateReportInput,
  ReportCollectionQuery,
  ReportStatus,
  UpdateReportStatusInput
} from "../validations/report-validation.js";

const notFoundMessage = "The requested resource was not found.";
const duplicateMessage = "You already have an active report for this listing.";
const transitionMessage = "The report status transition is not allowed from its current state.";

export interface AdminReport extends ListingReport {
  readonly reporter: IdentityUserProfile;
}
export interface AdminReportDetail extends AdminReport {
  readonly events: readonly ReportEvent[];
}
export interface AdminReportPage {
  readonly data: readonly AdminReport[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}
export interface ReportService {
  readonly create: (
    principal: AuthenticatedPrincipal,
    listingId: number,
    input: CreateReportInput
  ) => Promise<ListingReport>;
  readonly list: (principal: AuthenticatedPrincipal, query: ReportCollectionQuery) => Promise<AdminReportPage>;
  readonly get: (principal: AuthenticatedPrincipal, reportId: number) => Promise<AdminReportDetail>;
  readonly updateStatus: (
    principal: AuthenticatedPrincipal,
    reportId: number,
    input: UpdateReportStatusInput
  ) => Promise<AdminReportDetail>;
}

function requireRole(principal: AuthenticatedPrincipal, role: "TENANT" | "ADMIN"): number {
  if (principal.role !== role) throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}
function allowedTransition(current: ReportStatus, next: ReportStatus): boolean {
  return (
    (current === "OPEN" && (next === "INVESTIGATING" || next === "DISMISSED")) ||
    (current === "INVESTIGATING" && next === "RESOLVED")
  );
}
function mapDuplicate(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", duplicateMessage, { cause: error });
  }
  throw error;
}
function requireReporter(report: ListingReport, profiles: readonly IdentityUserProfile[]): IdentityUserProfile {
  const reporter = profiles.find((profile) => profile.id === report.reporterId);
  if (!reporter) throw new Error("Identity service reporter profile is missing.");
  return reporter;
}

export function createReportService(dependencies: {
  readonly repository: ReportRepository;
  readonly transactionRunner: TransactionRunner;
  readonly identityAccountClient: Pick<IdentityAccountClient, "loadActiveLandlordIds" | "loadProfilesByIds">;
}): ReportService {
  const { repository, transactionRunner, identityAccountClient } = dependencies;
  const enrich = async (reports: readonly ListingReport[]): Promise<readonly AdminReport[]> => {
    const profiles = await identityAccountClient.loadProfilesByIds([
      ...new Set(reports.map((report) => report.reporterId))
    ]);
    return Object.freeze(
      reports.map((report) => Object.freeze({ ...report, reporter: requireReporter(report, profiles) }))
    );
  };
  const service: ReportService = {
    async create(principal, listingId, input) {
      const reporterId = requireRole(principal, "TENANT");
      const activeLandlordIds = await identityAccountClient.loadActiveLandlordIds();
      try {
        return await transactionRunner(async (executor) => {
          if (!(await repository.isReportableListing(executor, listingId, activeLandlordIds))) {
            throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          }
          const report = await repository.create(executor, reporterId, listingId, input);
          await repository.appendEvent(executor, {
            reportId: report.id,
            actorId: reporterId,
            actorRole: "TENANT",
            previousStatus: null,
            newStatus: "OPEN",
            note: input.details
          });
          return report;
        });
      } catch (error) {
        return mapDuplicate(error);
      }
    },
    async list(principal, query) {
      requireRole(principal, "ADMIN");
      const rows = await transactionRunner((executor) =>
        repository.list(executor, {
          status: query.status,
          category: query.category,
          limit: query.pageSize + 1,
          offset: query.offset
        })
      );
      const pageRows = rows.slice(0, query.pageSize);
      return Object.freeze({
        data: await enrich(pageRows),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },
    async get(principal, reportId) {
      requireRole(principal, "ADMIN");
      const result = await transactionRunner(async (executor) => {
        const report = await repository.findById(executor, reportId);
        if (!report) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        return { report, events: await repository.listEvents(executor, reportId) };
      });
      const [report] = await enrich([result.report]);
      return Object.freeze({ ...report, events: result.events });
    },
    async updateStatus(principal, reportId, input) {
      const adminId = requireRole(principal, "ADMIN");
      const result = await transactionRunner(async (executor) => {
        const current = await repository.findById(executor, reportId, true);
        if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (!allowedTransition(current.status, input.status))
          throw new ApplicationError("CONCURRENT_MODIFICATION", transitionMessage);
        const report = await repository.updateStatus(executor, reportId, input.status, adminId, input.note);
        await repository.appendEvent(executor, {
          reportId,
          actorId: adminId,
          actorRole: "ADMIN",
          previousStatus: current.status,
          newStatus: input.status,
          note: input.note
        });
        return { report, events: await repository.listEvents(executor, reportId) };
      });
      const [report] = await enrich([result.report]);
      return Object.freeze({ ...report, events: result.events });
    }
  };
  return Object.freeze(service);
}

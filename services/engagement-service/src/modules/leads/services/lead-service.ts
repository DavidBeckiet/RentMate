import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import type {
  LandlordLead,
  LeadNoteState,
  LeadReminderState,
  LeadRepository
} from "../repositories/lead-repository.js";
import type { LeadCollectionQuery, LeadNoteInput, LeadReminderInput } from "../validations/lead-validation.js";

const notFoundMessage = "The requested resource was not found.";
const reminderHorizonMs = 365 * 24 * 60 * 60 * 1_000;

export interface LeadTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface LeadPage {
  readonly data: readonly LandlordLead[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface LeadService {
  readonly list: (principal: AuthenticatedPrincipal, query: LeadCollectionQuery) => Promise<LeadPage>;
  readonly saveNote: (
    principal: AuthenticatedPrincipal,
    inquiryId: number,
    input: LeadNoteInput
  ) => Promise<LeadNoteState>;
  readonly saveReminder: (
    principal: AuthenticatedPrincipal,
    inquiryId: number,
    input: LeadReminderInput
  ) => Promise<LeadReminderState>;
}

function landlordId(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

export function createLeadService(dependencies: {
  readonly repository: LeadRepository;
  readonly transactionRunner: LeadTransactionRunner;
  readonly now?: () => Date;
}): LeadService {
  const { repository, transactionRunner, now = () => new Date() } = dependencies;
  const service: LeadService = {
    async list(principal, query) {
      const ownerId = landlordId(principal);
      const rows = await transactionRunner.run((executor) =>
        repository.list(executor, ownerId, query.view, query.pageSize + 1, query.offset)
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },
    async saveNote(principal, inquiryId, input) {
      const ownerId = landlordId(principal);
      return transactionRunner.run(async (executor) => {
        if (!(await repository.lockOwnedInquiry(executor, ownerId, inquiryId))) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        }
        if (input.note === null) {
          await repository.deleteNote(executor, ownerId, inquiryId);
          return Object.freeze({ inquiryId, note: null, updatedAt: null });
        }
        return repository.upsertNote(executor, ownerId, inquiryId, input.note);
      });
    },
    async saveReminder(principal, inquiryId, input) {
      const ownerId = landlordId(principal);
      if (input.remindAt !== null) {
        const remindAt = new Date(input.remindAt).getTime();
        const current = now().getTime();
        if (!Number.isFinite(remindAt) || remindAt <= current || remindAt > current + reminderHorizonMs) {
          throwValidationIssue(
            "remindAt",
            "OUT_OF_RANGE",
            "remindAt must be in the future and no more than 365 days away."
          );
        }
      }
      return transactionRunner.run(async (executor) => {
        if (!(await repository.lockOwnedInquiry(executor, ownerId, inquiryId))) {
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        }
        if (input.remindAt === null) {
          await repository.deleteReminder(executor, ownerId, inquiryId);
          return Object.freeze({ inquiryId, remindAt: null, updatedAt: null });
        }
        return repository.upsertReminder(executor, ownerId, inquiryId, input.remindAt);
      });
    }
  };
  return Object.freeze(service);
}

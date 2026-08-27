import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { IdentityRoommateTenantProjection } from "../../../../../shared/identity-account-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type {
  RoommateInterestRecord,
  RoommateMessageRecord,
  RoommateProfileRecord,
  RoommateRepository,
  RoommateRequestRecord
} from "../repositories/roommate-repository.js";
import type {
  RoommateReportEvent,
  RoommateReportRecord,
  RoommateSafetyRepository
} from "../repositories/roommate-safety-repository.js";
import {
  validateCreateRoommateMessageBody,
  type CreateRoommateMessageInput,
  type RoommateMessagePageQuery
} from "../validations/roommate-message-validation.js";
import type {
  CreateRoommateInterestReportInput,
  CreateRoommateMessageReportInput,
  CreateRoommateRequestReportInput,
  RoommateModerationInput,
  RoommateReportCategory,
  RoommateReportCollectionQuery,
  RoommateReportStatus,
  RoommateReportTargetType,
  UpdateRoommateReportStatusInput
} from "../validations/roommate-safety-validation.js";

const notFoundMessage = "The requested resource was not found.";
const blockedMessage = "This roommate interaction is no longer available.";
const threadReadOnlyMessage = "This roommate conversation is read-only.";
const requestExpiredMessage = "This roommate request has expired.";

export interface RoommateMessageView {
  readonly id: number;
  readonly sender: "SELF" | "COUNTERPART";
  readonly body: string;
  readonly createdAt: string;
  readonly isRead: boolean;
}

export interface RoommateBlockView {
  readonly blocked: boolean;
}

export interface RoommateReportReceipt {
  readonly id: number;
  readonly targetType: RoommateReportTargetType;
  readonly category: RoommateReportCategory;
  readonly status: RoommateReportStatus;
  readonly createdAt: string;
}

export interface RoommateAdminReportEventView {
  readonly eventType: RoommateReportEvent["eventType"];
  readonly previousStatus: RoommateReportEvent["previousStatus"];
  readonly newStatus: RoommateReportEvent["newStatus"];
  readonly note: string | null;
  readonly createdAt: string;
}

export interface RoommateAdminReportView extends RoommateReportReceipt {
  readonly details: string | null;
  readonly resolutionNote: string | null;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly reporter: Readonly<{ displayName: string | null; memberSince: string | null }>;
  readonly subject: Readonly<{ requestId: number; messageId: number | null; profileTenantId?: number }>;
  readonly evidenceSnapshot?: Readonly<Record<string, unknown>>;
  readonly events?: readonly RoommateAdminReportEventView[];
}

export interface RoommateModerationView {
  readonly targetType: RoommateReportTargetType;
  readonly state: "VISIBLE" | "HIDDEN";
}

export interface RoommateSafetyPage<Value> {
  readonly data: readonly Value[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface RoommateSafetyService {
  readonly listMessages: (
    principal: AuthenticatedPrincipal,
    interestId: number,
    query: RoommateMessagePageQuery
  ) => Promise<RoommateSafetyPage<RoommateMessageView>>;
  readonly sendMessage: (
    principal: AuthenticatedPrincipal,
    interestId: number,
    input: CreateRoommateMessageInput
  ) => Promise<RoommateMessageView>;
  readonly markMessagesRead: (principal: AuthenticatedPrincipal, interestId: number) => Promise<void>;
  readonly blockRequest: (principal: AuthenticatedPrincipal, requestId: number) => Promise<RoommateBlockView>;
  readonly unblockRequest: (principal: AuthenticatedPrincipal, requestId: number) => Promise<RoommateBlockView>;
  readonly blockInterest: (principal: AuthenticatedPrincipal, interestId: number) => Promise<RoommateBlockView>;
  readonly unblockInterest: (principal: AuthenticatedPrincipal, interestId: number) => Promise<RoommateBlockView>;
  readonly createRequestReport: (
    principal: AuthenticatedPrincipal,
    requestId: number,
    input: CreateRoommateRequestReportInput
  ) => Promise<RoommateReportReceipt>;
  readonly createInterestReport: (
    principal: AuthenticatedPrincipal,
    interestId: number,
    input: CreateRoommateInterestReportInput
  ) => Promise<RoommateReportReceipt>;
  readonly createMessageReport: (
    principal: AuthenticatedPrincipal,
    messageId: number,
    input: CreateRoommateMessageReportInput
  ) => Promise<RoommateReportReceipt>;
  readonly listAdminReports: (
    principal: AuthenticatedPrincipal,
    query: RoommateReportCollectionQuery
  ) => Promise<RoommateSafetyPage<RoommateAdminReportView>>;
  readonly getAdminReport: (
    principal: AuthenticatedPrincipal,
    reportId: number
  ) => Promise<RoommateAdminReportView | null>;
  readonly updateAdminReportStatus: (
    principal: AuthenticatedPrincipal,
    reportId: number,
    input: UpdateRoommateReportStatusInput
  ) => Promise<RoommateAdminReportView | null>;
  readonly moderateProfile: (
    principal: AuthenticatedPrincipal,
    tenantId: number,
    input: RoommateModerationInput
  ) => Promise<RoommateModerationView>;
  readonly moderateRequest: (
    principal: AuthenticatedPrincipal,
    requestId: number,
    input: RoommateModerationInput
  ) => Promise<RoommateModerationView>;
  readonly moderateMessage: (
    principal: AuthenticatedPrincipal,
    messageId: number,
    input: RoommateModerationInput
  ) => Promise<RoommateModerationView>;
}

export interface RoommateSafetyTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

interface RoommateSafetyDependencies {
  readonly roommateRepository: RoommateRepository;
  readonly safetyRepository: RoommateSafetyRepository;
  readonly identityAccountClient: Pick<
    import("../../../../../shared/identity-account-client.js").IdentityAccountClient,
    "loadRoommateTenantProjectionsByIds"
  >;
  readonly transactionRunner: RoommateSafetyTransactionRunner;
  readonly now?: () => Date;
}

interface ExpiryOutcome {
  readonly kind: "REQUEST_EXPIRED";
}

interface MessageOutcome {
  readonly kind: "CREATED";
  readonly message: RoommateMessageRecord;
}

function requireTenant(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "TENANT") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function requireAdmin(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "ADMIN") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function isExpired(request: RoommateRequestRecord, currentTime: Date): boolean {
  return new Date(request.expiresAt).getTime() <= currentTime.getTime();
}

function activeProfile(profile: RoommateProfileRecord | null): profile is RoommateProfileRecord {
  return profile !== null && profile.moderationState === "VISIBLE" && [...profile.intro].length >= 20;
}

function mapDependencyError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError && error.code === "DEPENDENCY_UNAVAILABLE") return error;
  return new ApplicationError("DEPENDENCY_UNAVAILABLE", "A required service is temporarily unavailable.", {
    cause: error
  });
}

function reportReceipt(report: RoommateReportRecord): RoommateReportReceipt {
  return Object.freeze({
    id: report.id,
    targetType: report.targetType,
    category: report.category,
    status: report.status,
    createdAt: report.createdAt
  });
}

function messageView(message: RoommateMessageRecord, viewerTenantId: number): RoommateMessageView {
  return Object.freeze({
    id: message.id,
    sender: message.senderTenantId === viewerTenantId ? "SELF" : "COUNTERPART",
    body: message.moderationState === "VISIBLE" ? message.body : "This message is no longer available.",
    createdAt: message.createdAt,
    isRead: message.senderTenantId === viewerTenantId || message.readAt !== null
  });
}

function blockView(blocked: boolean): RoommateBlockView {
  return Object.freeze({ blocked });
}

function canTransitionReportStatus(current: RoommateReportStatus, next: RoommateReportStatus): boolean {
  return (
    (current === "OPEN" && (next === "INVESTIGATING" || next === "DISMISSED")) ||
    (current === "INVESTIGATING" && next === "RESOLVED")
  );
}

function reportMatches(
  report: RoommateReportRecord,
  targetType: RoommateReportTargetType,
  requestId: number,
  subjectTenantId: number | null,
  messageId: number | null
): boolean {
  return (
    report.targetType === targetType &&
    report.requestId === requestId &&
    report.subjectTenantId === subjectTenantId &&
    report.messageId === messageId
  );
}

function reportEvidenceProfile(profile: RoommateProfileRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "ROOMMATE_PROFILE",
    intro: profile.intro,
    sleepSchedule: profile.sleepSchedule,
    cleanlinessLevel: profile.cleanlinessLevel,
    noisePreference: profile.noisePreference,
    smokingEnvironment: profile.smokingEnvironment,
    petEnvironment: profile.petEnvironment,
    capturedAt: profile.updatedAt
  });
}

function reportEvidenceRequest(request: RoommateRequestRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "ROOMMATE_REQUEST",
    requestId: request.id,
    listingId: request.listingId,
    preferredAreaKeys: [...request.preferredAreaKeys],
    budgetMinPerPerson: request.budgetMinPerPerson,
    budgetMaxPerPerson: request.budgetMaxPerPerson,
    moveInFrom: request.moveInFrom,
    moveInUntil: request.moveInUntil,
    note: request.note,
    status: request.status,
    capturedAt: request.updatedAt
  });
}

function reportEvidenceMessage(message: RoommateMessageRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "ROOMMATE_MESSAGE",
    messageId: message.id,
    body: message.body,
    createdAt: message.createdAt
  });
}

export function createRoommateSafetyService(dependencies: RoommateSafetyDependencies): RoommateSafetyService {
  const {
    roommateRepository,
    safetyRepository,
    identityAccountClient,
    transactionRunner,
    now = () => new Date()
  } = dependencies;

  const loadIdentity = async (tenantIds: readonly number[]): Promise<readonly IdentityRoommateTenantProjection[]> => {
    try {
      return await identityAccountClient.loadRoommateTenantProjectionsByIds([...new Set(tenantIds)]);
    } catch (error) {
      throw mapDependencyError(error);
    }
  };

  const lockTenants = async (executor: SqlExecutor, tenantIds: readonly number[]): Promise<void> => {
    for (const tenantId of [...new Set(tenantIds)].sort((left, right) => left - right)) {
      await roommateRepository.lockTenant(executor, tenantId);
    }
  };

  const participant = (interest: RoommateInterestRecord, tenantId: number): number => {
    if (interest.requestOwnerTenantId === tenantId) return interest.interestedTenantId;
    if (interest.interestedTenantId === tenantId) return interest.requestOwnerTenantId;
    throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
  };

  const requireParticipant = async (
    executor: SqlExecutor,
    interestId: number,
    tenantId: number,
    forUpdate = false,
    rejectBlocked = true
  ): Promise<RoommateInterestRecord> => {
    const interest = await roommateRepository.findInterestById(executor, interestId, forUpdate);
    if (!interest) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    participant(interest, tenantId);
    if (
      rejectBlocked &&
      (await roommateRepository.isPairBlocked(executor, interest.requestOwnerTenantId, interest.interestedTenantId))
    ) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    }
    return interest;
  };

  const requireVisibleRequestContext = async (
    executor: SqlExecutor,
    tenantId: number,
    request: RoommateRequestRecord,
    allowOwner = false,
    ignorePairBlock = false
  ): Promise<void> => {
    if (!allowOwner && request.ownerTenantId === tenantId)
      throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    if (request.status !== "OPEN" || request.moderationState !== "VISIBLE" || isExpired(request, now())) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    }
    const projections = await loadIdentity([tenantId, request.ownerTenantId]);
    const projectionById = new Map(projections.map((value) => [value.tenantId, value] as const));
    for (const id of [tenantId, request.ownerTenantId]) {
      const projection = projectionById.get(id);
      if (!projection || projection.role !== "TENANT" || !projection.isActive) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      }
    }
    const profiles = await roommateRepository.findProfiles(executor, [request.ownerTenantId]);
    if (!activeProfile(profiles.find((profile) => profile.tenantId === request.ownerTenantId) ?? null)) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    }
    if (!ignorePairBlock && (await roommateRepository.isPairBlocked(executor, tenantId, request.ownerTenantId))) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    }
  };

  const adminReportView = async (
    report: RoommateReportRecord,
    includeEvidence: boolean,
    events?: readonly RoommateReportEvent[]
  ): Promise<RoommateAdminReportView> => {
    const [identity] = await loadIdentity([report.reporterTenantId]);
    const profileTenantId = includeEvidence && report.targetType === "ROOMMATE_PROFILE" ? report.subjectTenantId : null;
    const safeEvents = events?.map(
      (event): RoommateAdminReportEventView =>
        Object.freeze({
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          note: event.note,
          createdAt: event.createdAt
        })
    );
    return Object.freeze({
      ...reportReceipt(report),
      details: report.details,
      resolutionNote: report.resolutionNote,
      updatedAt: report.updatedAt,
      resolvedAt: report.resolvedAt,
      reporter: Object.freeze({
        displayName: identity?.displayName ?? null,
        memberSince: identity?.memberSince ?? null
      }),
      subject: Object.freeze({
        requestId: report.requestId,
        messageId: report.messageId,
        ...(profileTenantId === null ? {} : { profileTenantId })
      }),
      ...(includeEvidence ? { evidenceSnapshot: report.evidenceSnapshot } : {}),
      ...(safeEvents === undefined ? {} : { events: Object.freeze(safeEvents) })
    });
  };

  const service: RoommateSafetyService = {
    async listMessages(principal, interestId, query) {
      const tenantId = requireTenant(principal);
      const rows = await transactionRunner.run(async (executor) => {
        const initial = await requireParticipant(executor, interestId, tenantId);
        await lockTenants(executor, [initial.requestOwnerTenantId, initial.interestedTenantId]);
        let interest = await requireParticipant(executor, interestId, tenantId, true);
        if (interest.status === "PENDING" && interest.request.status === "OPEN" && isExpired(interest.request, now())) {
          await roommateRepository.materializeExpired(executor, interest.request.id, now());
          interest = await requireParticipant(executor, interestId, tenantId, true);
        }
        const messages = await safetyRepository.listMessages(executor, interestId, query.pageSize + 1, query.offset);
        for (const message of messages) {
          if (message.interestId !== interest.id) throw new ApplicationError("CONCURRENT_MODIFICATION", blockedMessage);
        }
        return messages;
      });
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize).map((message) => messageView(message, tenantId))),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async sendMessage(principal, interestId, input) {
      const tenantId = requireTenant(principal);
      const normalized = validateCreateRoommateMessageBody(input).body;
      const outcome = await transactionRunner.run<MessageOutcome | ExpiryOutcome>(async (executor) => {
        const initial = await requireParticipant(executor, interestId, tenantId, false, true);
        await lockTenants(executor, [initial.requestOwnerTenantId, initial.interestedTenantId]);
        const current = await requireParticipant(executor, interestId, tenantId, true, true);
        const recipientId = participant(current, tenantId);
        if (current.status !== "PENDING" && current.status !== "ACCEPTED") {
          throw new ApplicationError("CONCURRENT_MODIFICATION", threadReadOnlyMessage);
        }
        if (current.request.moderationState !== "VISIBLE") {
          throw new ApplicationError("CONCURRENT_MODIFICATION", threadReadOnlyMessage);
        }
        if (current.status === "PENDING") {
          if (current.request.status === "OPEN" && isExpired(current.request, now())) {
            await roommateRepository.materializeExpired(executor, current.request.id, now());
            return Object.freeze({ kind: "REQUEST_EXPIRED" as const });
          }
          if (current.request.status !== "OPEN") {
            throw new ApplicationError("CONCURRENT_MODIFICATION", threadReadOnlyMessage);
          }
        }
        const message = await safetyRepository.createMessage(executor, {
          interestId,
          senderTenantId: tenantId,
          body: normalized
        });
        await safetyRepository.createNotification(executor, {
          recipientId,
          eventType: "ROOMMATE_MESSAGE_RECEIVED",
          interestId,
          dedupeKey: `roommate:message-received:${interestId}:${recipientId}`,
          refreshOnDuplicate: true
        });
        return Object.freeze({ kind: "CREATED" as const, message });
      });
      if (outcome.kind === "REQUEST_EXPIRED")
        throw new ApplicationError("ROOMMATE_REQUEST_EXPIRED", requestExpiredMessage);
      const created = outcome.message;
      return messageView(created, tenantId);
    },

    async markMessagesRead(principal, interestId) {
      const tenantId = requireTenant(principal);
      await transactionRunner.run(async (executor) => {
        const initial = await requireParticipant(executor, interestId, tenantId, false, true);
        await lockTenants(executor, [initial.requestOwnerTenantId, initial.interestedTenantId]);
        let current = await requireParticipant(executor, interestId, tenantId, true, true);
        if (current.status === "PENDING" && current.request.status === "OPEN" && isExpired(current.request, now())) {
          await roommateRepository.materializeExpired(executor, current.request.id, now());
          current = await requireParticipant(executor, interestId, tenantId, true, true);
        }
        await safetyRepository.markMessagesRead(executor, interestId, tenantId);
      });
    },

    async blockRequest(principal, requestId) {
      const tenantId = requireTenant(principal);
      const outcome = await transactionRunner.run(async (executor) => {
        let request = await roommateRepository.findRequestById(executor, requestId);
        if (!request) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (request.status === "OPEN" && isExpired(request, now())) {
          await roommateRepository.lockTenant(executor, request.ownerTenantId);
          await roommateRepository.materializeExpired(executor, request.id, now());
          return Object.freeze({ kind: "EXPIRED" as const });
        }
        await lockTenants(executor, [tenantId, request.ownerTenantId]);
        request = (await roommateRepository.findRequestById(executor, requestId, true)) ?? request;
        const ownBlock = await safetyRepository.findBlock(executor, tenantId, request.ownerTenantId, undefined, true);
        await requireVisibleRequestContext(executor, tenantId, request, false, ownBlock !== null);
        if (ownBlock === null) {
          await safetyRepository.createBlock(executor, {
            blockerTenantId: tenantId,
            blockedTenantId: request.ownerTenantId,
            requestId
          });
        }
        await safetyRepository.applyBlockEffects(executor, tenantId, request.ownerTenantId);
        return Object.freeze({ kind: "BLOCKED" as const });
      });
      if (outcome.kind === "EXPIRED") throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      return blockView(true);
    },

    async unblockRequest(principal, requestId) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        const request = await roommateRepository.findRequestById(executor, requestId);
        if (!request || request.ownerTenantId === tenantId)
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        await lockTenants(executor, [tenantId, request.ownerTenantId]);
        const block = await safetyRepository.findBlock(executor, tenantId, request.ownerTenantId, undefined, true);
        if (!block) return blockView(false);
        await safetyRepository.deleteBlock(executor, {
          blockerTenantId: tenantId,
          blockedTenantId: request.ownerTenantId
        });
        return blockView(false);
      });
    },

    async blockInterest(principal, interestId) {
      const tenantId = requireTenant(principal);
      await transactionRunner.run(async (executor) => {
        const initial = await requireParticipant(executor, interestId, tenantId, false, false);
        await lockTenants(executor, [initial.requestOwnerTenantId, initial.interestedTenantId]);
        const current = await requireParticipant(executor, interestId, tenantId, true, false);
        const counterpartId = participant(current, tenantId);
        await safetyRepository.createBlock(executor, {
          blockerTenantId: tenantId,
          blockedTenantId: counterpartId,
          requestId: current.requestId
        });
        await safetyRepository.applyBlockEffects(executor, tenantId, counterpartId);
      });
      return blockView(true);
    },

    async unblockInterest(principal, interestId) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        const initial = await requireParticipant(executor, interestId, tenantId, false, false);
        await lockTenants(executor, [initial.requestOwnerTenantId, initial.interestedTenantId]);
        const current = await requireParticipant(executor, interestId, tenantId, true, false);
        const counterpartId = participant(current, tenantId);
        const block = await safetyRepository.findBlock(executor, tenantId, counterpartId, undefined, true);
        if (!block) return blockView(false);
        await safetyRepository.deleteBlock(executor, {
          blockerTenantId: tenantId,
          blockedTenantId: counterpartId
        });
        return blockView(false);
      });
    },

    async createRequestReport(principal, requestId, input) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        const request = await roommateRepository.findRequestById(executor, requestId);
        if (!request) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        await requireVisibleRequestContext(executor, tenantId, request);
        const profile = await roommateRepository.findProfile(executor, request.ownerTenantId);
        if (!activeProfile(profile)) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const subjectTenantId = input.targetType === "ROOMMATE_PROFILE" ? request.ownerTenantId : null;
        const report = await safetyRepository.createReport(executor, {
          reporterTenantId: tenantId,
          requestId,
          targetType: input.targetType,
          subjectTenantId,
          messageId: null,
          category: input.category,
          details: input.details,
          evidenceSnapshot:
            input.targetType === "ROOMMATE_PROFILE" ? reportEvidenceProfile(profile) : reportEvidenceRequest(request)
        });
        if (report.created) {
          await safetyRepository.appendReportEvent(executor, {
            reportId: report.report.id,
            actorId: tenantId,
            actorRole: "TENANT",
            previousStatus: null,
            newStatus: "OPEN",
            note: input.details
          });
        }
        return reportReceipt(report.report);
      });
    },

    async createInterestReport(principal, interestId, input) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        const interest = await requireParticipant(executor, interestId, tenantId, false, true);
        const profile = await roommateRepository.findProfile(executor, participant(interest, tenantId));
        if (!profile) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const report = await safetyRepository.createReport(executor, {
          reporterTenantId: tenantId,
          requestId: interest.requestId,
          targetType: "ROOMMATE_PROFILE",
          subjectTenantId: participant(interest, tenantId),
          messageId: null,
          category: input.category,
          details: input.details,
          evidenceSnapshot: reportEvidenceProfile(profile)
        });
        if (report.created) {
          await safetyRepository.appendReportEvent(executor, {
            reportId: report.report.id,
            actorId: tenantId,
            actorRole: "TENANT",
            previousStatus: null,
            newStatus: "OPEN",
            note: input.details
          });
        }
        return reportReceipt(report.report);
      });
    },

    async createMessageReport(principal, messageId, input) {
      const tenantId = requireTenant(principal);
      return transactionRunner.run(async (executor) => {
        const message = await safetyRepository.findMessageById(executor, messageId);
        if (!message) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const interest = await requireParticipant(executor, message.interestId, tenantId, false, true);
        const report = await safetyRepository.createReport(executor, {
          reporterTenantId: tenantId,
          requestId: interest.requestId,
          targetType: "ROOMMATE_MESSAGE",
          subjectTenantId: null,
          messageId,
          category: input.category,
          details: input.details,
          evidenceSnapshot: reportEvidenceMessage(message)
        });
        if (report.created) {
          await safetyRepository.appendReportEvent(executor, {
            reportId: report.report.id,
            actorId: tenantId,
            actorRole: "TENANT",
            previousStatus: null,
            newStatus: "OPEN",
            note: input.details
          });
        }
        return reportReceipt(report.report);
      });
    },

    async listAdminReports(principal, query) {
      requireAdmin(principal);
      const reports = await transactionRunner.run((executor) =>
        safetyRepository.listReports(executor, {
          status: query.status,
          category: query.category,
          limit: query.pageSize + 1,
          offset: query.offset
        })
      );
      const views: RoommateAdminReportView[] = [];
      for (const report of reports.slice(0, query.pageSize)) views.push(await adminReportView(report, false));
      return Object.freeze({
        data: Object.freeze(views),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: reports.length > query.pageSize
      });
    },

    async getAdminReport(principal, reportId) {
      requireAdmin(principal);
      const result = await transactionRunner.run(async (executor) => {
        const report = await safetyRepository.findReport(executor, reportId);
        if (!report) return null;
        return { report, events: await safetyRepository.listReportEvents(executor, reportId) };
      });
      if (!result) return null;
      return adminReportView(result.report, true, result.events);
    },

    async updateAdminReportStatus(principal, reportId, input) {
      const adminId = requireAdmin(principal);
      const result = await transactionRunner.run(async (executor) => {
        const current = await safetyRepository.findReport(executor, reportId, true);
        if (!current) return null;
        if (!canTransitionReportStatus(current.status, input.status)) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", "The report status transition is not allowed.");
        }
        const updated = await safetyRepository.updateReportStatus(
          executor,
          reportId,
          input.status,
          adminId,
          input.note
        );
        await safetyRepository.appendReportEvent(executor, {
          reportId,
          actorId: adminId,
          actorRole: "ADMIN",
          previousStatus: current.status,
          newStatus: input.status,
          note: input.note
        });
        return { report: updated, events: await safetyRepository.listReportEvents(executor, reportId) };
      });
      if (!result) return null;
      return adminReportView(result.report, true, result.events);
    },

    async moderateProfile(principal, tenantId, input) {
      const adminId = requireAdmin(principal);
      return moderateSubject("ROOMMATE_PROFILE", tenantId, tenantId, input, adminId);
    },

    async moderateRequest(principal, requestId, input) {
      const adminId = requireAdmin(principal);
      return moderateSubject("ROOMMATE_REQUEST", requestId, requestId, input, adminId);
    },

    async moderateMessage(principal, messageId, input) {
      const adminId = requireAdmin(principal);
      return moderateSubject("ROOMMATE_MESSAGE", messageId, messageId, input, adminId);
    }
  };

  async function moderateSubject(
    targetType: RoommateReportTargetType,
    pathId: number,
    subjectId: number,
    input: RoommateModerationInput,
    adminId: number
  ): Promise<RoommateModerationView> {
    return transactionRunner.run(async (executor) => {
      const report = await safetyRepository.findReport(executor, input.reportId, true);
      if (!report) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      const expectedRequestId = targetType === "ROOMMATE_REQUEST" ? pathId : report.requestId;
      if (
        !reportMatches(
          report,
          targetType,
          expectedRequestId,
          targetType === "ROOMMATE_PROFILE" ? subjectId : null,
          targetType === "ROOMMATE_MESSAGE" ? subjectId : null
        )
      ) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      }
      if (report.status !== "OPEN" && report.status !== "INVESTIGATING") {
        throw new ApplicationError("CONCURRENT_MODIFICATION", "The report is no longer actionable.");
      }
      const current =
        targetType === "ROOMMATE_PROFILE"
          ? await safetyRepository.findProfileModeration(executor, pathId, true)
          : targetType === "ROOMMATE_REQUEST"
            ? await safetyRepository.findRequestModeration(executor, pathId, true)
            : await safetyRepository.findMessageModeration(executor, pathId, true);
      if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      if (current === input.state) return Object.freeze({ targetType, state: current });
      if (input.note === null) {
        throw new ApplicationError("VALIDATION_FAILED", "A moderation note is required when changing state.");
      }
      const updated =
        targetType === "ROOMMATE_PROFILE"
          ? await safetyRepository.updateProfileModeration(executor, pathId, input.state)
          : targetType === "ROOMMATE_REQUEST"
            ? await safetyRepository.updateRequestModeration(executor, pathId, input.state)
            : await safetyRepository.updateMessageModeration(executor, pathId, input.state);
      if (!updated) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      await safetyRepository.appendModerationEvent(executor, {
        reportId: report.id,
        actorId: adminId,
        targetType,
        subjectId,
        state: input.state,
        note: input.note
      });
      return Object.freeze({ targetType, state: updated });
    });
  }

  return Object.freeze(service);
}

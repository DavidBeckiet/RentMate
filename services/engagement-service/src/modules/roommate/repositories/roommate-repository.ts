import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { notificationRealtimeNotifyExpression } from "../../contact/realtime/notification-realtime-channel.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import { areaSearchTerms } from "@rentmate/service-shared/area-domain";
import type {
  CleanlinessLevel,
  CreateRoommateRequestInput,
  NoisePreference,
  PetEnvironment,
  PatchRoommateRequestInput,
  RoommateProfileInput,
  RoommateRequestStatus,
  SleepSchedule,
  SmokingEnvironment
} from "../validations/roommate-validation.js";
import type { RoommateInterestDirection, RoommateInterestStatus } from "../validations/roommate-interest-validation.js";

export interface RoommateProfileRecord extends RoommateProfileInput {
  readonly tenantId: number;
  readonly moderationState: "VISIBLE" | "HIDDEN";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoommateRequestRecord extends CreateRoommateRequestInput {
  readonly id: number;
  readonly ownerTenantId: number;
  readonly status: RoommateRequestStatus;
  readonly expiresAt: string;
  readonly listingLinkedAt: string | null;
  readonly moderationState: "VISIBLE" | "HIDDEN";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoommateDiscoveryCandidate extends RoommateRequestRecord {
  readonly profile: RoommateProfileRecord;
}

export type RoommateInterestTerminalReason =
  | "USER_ACTION"
  | "REQUEST_CANCELLED"
  | "REQUEST_EXPIRED"
  | "COMPETING_INTEREST_ACCEPTED"
  | "PARTICIPANT_MATCHED_ELSEWHERE"
  | "PARTICIPANT_BLOCKED"
  | "MODERATION_ACTION";

export interface RoommateMessageRecord {
  readonly id: number;
  readonly interestId: number;
  readonly senderTenantId: number;
  readonly body: string;
  readonly moderationState: "VISIBLE" | "HIDDEN";
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface RoommateInterestRecord {
  readonly id: number;
  readonly requestId: number;
  readonly requestOwnerTenantId: number;
  readonly interestedTenantId: number;
  readonly status: RoommateInterestStatus;
  readonly acceptedAt: string | null;
  readonly endedAt: string | null;
  readonly endedByTenantId: number | null;
  readonly terminalReason: RoommateInterestTerminalReason | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly request: RoommateRequestRecord;
  readonly firstMessage: RoommateMessageRecord | null;
  readonly lastMessage?: RoommateMessageRecord | null;
  readonly ownerUnreadCount?: number;
  readonly candidateUnreadCount?: number;
}

interface ProfileRow extends QueryResultRow {
  tenant_id: unknown;
  intro: unknown;
  sleep_schedule: unknown;
  cleanliness_level: unknown;
  noise_preference: unknown;
  smoking_environment: unknown;
  pet_environment: unknown;
  moderation_state: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface RequestRow extends QueryResultRow {
  id: unknown;
  owner_tenant_id: unknown;
  listing_id: unknown;
  preferred_area_keys: unknown;
  budget_min_per_person: unknown;
  budget_max_per_person: unknown;
  move_in_from: unknown;
  move_in_until: unknown;
  note: unknown;
  status: unknown;
  expires_at: unknown;
  listing_linked_at: unknown;
  moderation_state: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface CandidateRow extends RequestRow {
  profile_tenant_id: unknown;
  profile_intro: unknown;
  profile_sleep_schedule: unknown;
  profile_cleanliness_level: unknown;
  profile_noise_preference: unknown;
  profile_smoking_environment: unknown;
  profile_pet_environment: unknown;
  profile_moderation_state: unknown;
  profile_created_at: unknown;
  profile_updated_at: unknown;
}

interface ExpiredRequestRow extends QueryResultRow {
  id: unknown;
  owner_tenant_id: unknown;
  expires_at: unknown;
}

interface PendingInterestRow extends QueryResultRow {
  id: unknown;
  interested_tenant_id: unknown;
}

interface InterestRow extends QueryResultRow {
  interest_id: unknown;
  interest_request_id: unknown;
  interest_owner_tenant_id: unknown;
  interested_tenant_id: unknown;
  interest_status: unknown;
  accepted_at: unknown;
  ended_at: unknown;
  ended_by_tenant_id: unknown;
  terminal_reason: unknown;
  interest_created_at: unknown;
  interest_updated_at: unknown;
  request_id: unknown;
  owner_tenant_id: unknown;
  listing_id: unknown;
  preferred_area_keys: unknown;
  budget_min_per_person: unknown;
  budget_max_per_person: unknown;
  move_in_from: unknown;
  move_in_until: unknown;
  note: unknown;
  status: unknown;
  expires_at: unknown;
  listing_linked_at: unknown;
  moderation_state: unknown;
  created_at: unknown;
  updated_at: unknown;
  first_message_id: unknown;
  first_message_interest_id: unknown;
  first_message_sender_tenant_id: unknown;
  first_message_body: unknown;
  first_message_moderation_state: unknown;
  first_message_created_at: unknown;
  first_message_read_at: unknown;
}

interface InterestIdRow extends QueryResultRow {
  id: unknown;
}

interface CountRow extends QueryResultRow {
  count: unknown;
}

const profileColumns = `
  tenant_id, intro, sleep_schedule, cleanliness_level, noise_preference,
  smoking_environment, pet_environment, moderation_state, created_at, updated_at
`;

const requestColumns = `
  id, owner_tenant_id, listing_id, preferred_area_keys, budget_min_per_person,
  budget_max_per_person, move_in_from, move_in_until, note, status, expires_at,
  listing_linked_at, moderation_state, created_at, updated_at
`;

const interestColumns = `
  i.id AS interest_id,
  i.request_id AS interest_request_id,
  r.owner_tenant_id AS interest_owner_tenant_id,
  i.interested_tenant_id,
  i.status AS interest_status,
  i.accepted_at,
  i.ended_at,
  i.ended_by_tenant_id,
  i.terminal_reason,
  i.created_at AS interest_created_at,
  i.updated_at AS interest_updated_at,
  r.id AS request_id,
  r.owner_tenant_id,
  r.listing_id,
  r.preferred_area_keys,
  r.budget_min_per_person,
  r.budget_max_per_person,
  r.move_in_from,
  r.move_in_until,
  r.note,
  r.status,
  r.expires_at,
  r.listing_linked_at,
  r.moderation_state,
  r.created_at,
  r.updated_at,
  first_message.id AS first_message_id,
  first_message.interest_id AS first_message_interest_id,
  first_message.sender_tenant_id AS first_message_sender_tenant_id,
  first_message.body AS first_message_body,
  first_message.moderation_state AS first_message_moderation_state,
  first_message.created_at AS first_message_created_at,
  first_message.read_at AS first_message_read_at,
  latest_message.id AS latest_message_id,
  latest_message.interest_id AS latest_message_interest_id,
  latest_message.sender_tenant_id AS latest_message_sender_tenant_id,
  latest_message.body AS latest_message_body,
  latest_message.moderation_state AS latest_message_moderation_state,
  latest_message.created_at AS latest_message_created_at,
  latest_message.read_at AS latest_message_read_at,
  (SELECT count(*)::int FROM roommate_messages um WHERE um.interest_id = i.id
    AND um.read_at IS NULL AND um.sender_tenant_id <> r.owner_tenant_id) AS owner_unread_count,
  (SELECT count(*)::int FROM roommate_messages um WHERE um.interest_id = i.id
    AND um.read_at IS NULL AND um.sender_tenant_id <> i.interested_tenant_id) AS candidate_unread_count
`;

const interestFrom = `
  FROM roommate_interests i
  JOIN roommate_requests r ON r.id = i.request_id
  LEFT JOIN LATERAL (
    SELECT m.id, m.interest_id, m.sender_tenant_id, m.body, m.moderation_state, m.created_at, m.read_at
    FROM roommate_messages m
    WHERE m.interest_id = i.id
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 1
  ) AS first_message ON true
  LEFT JOIN LATERAL (
    SELECT m.id, m.interest_id, m.sender_tenant_id, m.body, m.moderation_state, m.created_at, m.read_at
    FROM roommate_messages m WHERE m.interest_id = i.id
    ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) AS latest_message ON true
`;

function positiveId(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return parsed;
}

function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field);
}

function timestamp(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  try {
    return formatApiTimestamp(date);
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as string | null;
}

function enumText<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as T;
}

function budget(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 999_999_999_999) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return parsed;
}

function areaKeys(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RepositoryInvariantError("roommateRequest.preferredAreaKeys is invalid.");
  }
  return Object.freeze([...(value as string[])]);
}

function dateValue(value: unknown, field: string): string {
  const result = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result)) throw new RepositoryInvariantError(`${field} is invalid.`);
  return result;
}

function mapProfile(row: Readonly<ProfileRow>): RoommateProfileRecord {
  return Object.freeze({
    tenantId: positiveId(row.tenant_id, "roommateProfile.tenantId"),
    intro: text(row.intro, "roommateProfile.intro"),
    sleepSchedule: enumText(row.sleep_schedule, "roommateProfile.sleepSchedule", [
      "EARLY",
      "STANDARD",
      "LATE",
      "FLEXIBLE"
    ]),
    cleanlinessLevel: enumText(row.cleanliness_level, "roommateProfile.cleanlinessLevel", [
      "RELAXED",
      "BALANCED",
      "TIDY"
    ]),
    noisePreference: enumText(row.noise_preference, "roommateProfile.noisePreference", ["QUIET", "BALANCED", "SOCIAL"]),
    smokingEnvironment: enumText(row.smoking_environment, "roommateProfile.smokingEnvironment", [
      "SMOKE_FREE",
      "OUTDOOR_ONLY",
      "NO_PREFERENCE"
    ]),
    petEnvironment: enumText(row.pet_environment, "roommateProfile.petEnvironment", [
      "NO_PETS",
      "OK_WITH_PETS",
      "HAS_PET"
    ]),
    moderationState: enumText(row.moderation_state, "roommateProfile.moderationState", ["VISIBLE", "HIDDEN"]),
    createdAt: timestamp(row.created_at, "roommateProfile.createdAt"),
    updatedAt: timestamp(row.updated_at, "roommateProfile.updatedAt")
  });
}

function mapRequest(row: Readonly<RequestRow>): RoommateRequestRecord {
  const status = enumText(row.status, "roommateRequest.status", ["OPEN", "MATCHED", "CANCELLED", "EXPIRED"]);
  const listingId = nullableId(row.listing_id, "roommateRequest.listingId");
  const listingLinkedAt = nullableTimestamp(row.listing_linked_at, "roommateRequest.listingLinkedAt");
  if ((listingId === null) !== (listingLinkedAt === null)) {
    throw new RepositoryInvariantError("roommateRequest listing link representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "roommateRequest.id"),
    ownerTenantId: positiveId(row.owner_tenant_id, "roommateRequest.ownerTenantId"),
    listingId,
    preferredAreaKeys: areaKeys(row.preferred_area_keys),
    budgetMinPerPerson: budget(row.budget_min_per_person, "roommateRequest.budgetMinPerPerson"),
    budgetMaxPerPerson: budget(row.budget_max_per_person, "roommateRequest.budgetMaxPerPerson"),
    moveInFrom: dateValue(row.move_in_from, "roommateRequest.moveInFrom"),
    moveInUntil: dateValue(row.move_in_until, "roommateRequest.moveInUntil"),
    note: nullableText(row.note, "roommateRequest.note"),
    status,
    expiresAt: timestamp(row.expires_at, "roommateRequest.expiresAt"),
    listingLinkedAt,
    moderationState: enumText(row.moderation_state, "roommateRequest.moderationState", ["VISIBLE", "HIDDEN"]),
    createdAt: timestamp(row.created_at, "roommateRequest.createdAt"),
    updatedAt: timestamp(row.updated_at, "roommateRequest.updatedAt")
  });
}

function mapCandidate(row: Readonly<CandidateRow>): RoommateDiscoveryCandidate {
  const request = mapRequest(row);
  const profile = mapProfile({
    tenant_id: row.profile_tenant_id,
    intro: row.profile_intro,
    sleep_schedule: row.profile_sleep_schedule,
    cleanliness_level: row.profile_cleanliness_level,
    noise_preference: row.profile_noise_preference,
    smoking_environment: row.profile_smoking_environment,
    pet_environment: row.profile_pet_environment,
    moderation_state: row.profile_moderation_state,
    created_at: row.profile_created_at,
    updated_at: row.profile_updated_at
  });
  if (profile.tenantId !== request.ownerTenantId)
    throw new RepositoryInvariantError("Roommate candidate owner mismatch.");
  return Object.freeze({ ...request, profile });
}

function mapMessage(row: {
  readonly first_message_id: unknown;
  readonly first_message_interest_id: unknown;
  readonly first_message_sender_tenant_id: unknown;
  readonly first_message_body: unknown;
  readonly first_message_moderation_state: unknown;
  readonly first_message_created_at: unknown;
  readonly first_message_read_at: unknown;
}): RoommateMessageRecord | null {
  if (row.first_message_id === null) return null;
  return Object.freeze({
    id: positiveId(row.first_message_id, "roommateMessage.id"),
    interestId: positiveId(row.first_message_interest_id, "roommateMessage.interestId"),
    senderTenantId: positiveId(row.first_message_sender_tenant_id, "roommateMessage.senderTenantId"),
    body: text(row.first_message_body, "roommateMessage.body"),
    moderationState: enumText(row.first_message_moderation_state, "roommateMessage.moderationState", [
      "VISIBLE",
      "HIDDEN"
    ]),
    createdAt: timestamp(row.first_message_created_at, "roommateMessage.createdAt"),
    readAt: nullableTimestamp(row.first_message_read_at, "roommateMessage.readAt")
  });
}

function mapInterest(row: Readonly<InterestRow>): RoommateInterestRecord {
  const request = mapRequest({
    id: row.request_id,
    owner_tenant_id: row.owner_tenant_id,
    listing_id: row.listing_id,
    preferred_area_keys: row.preferred_area_keys,
    budget_min_per_person: row.budget_min_per_person,
    budget_max_per_person: row.budget_max_per_person,
    move_in_from: row.move_in_from,
    move_in_until: row.move_in_until,
    note: row.note,
    status: row.status,
    expires_at: row.expires_at,
    listing_linked_at: row.listing_linked_at,
    moderation_state: row.moderation_state,
    created_at: row.created_at,
    updated_at: row.updated_at
  });
  if (request.id !== positiveId(row.interest_request_id, "roommateInterest.requestId")) {
    throw new RepositoryInvariantError("Roommate interest request mismatch.");
  }
  const requestOwnerTenantId = positiveId(row.interest_owner_tenant_id, "roommateInterest.requestOwnerTenantId");
  if (request.ownerTenantId !== requestOwnerTenantId) {
    throw new RepositoryInvariantError("Roommate interest owner mismatch.");
  }
  const status = enumText(row.interest_status, "roommateInterest.status", [
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "WITHDRAWN",
    "LEFT"
  ]);
  const terminalReason =
    row.terminal_reason === null
      ? null
      : enumText(row.terminal_reason, "roommateInterest.terminalReason", [
          "USER_ACTION",
          "REQUEST_CANCELLED",
          "REQUEST_EXPIRED",
          "COMPETING_INTEREST_ACCEPTED",
          "PARTICIPANT_MATCHED_ELSEWHERE",
          "PARTICIPANT_BLOCKED",
          "MODERATION_ACTION"
        ]);
  const firstMessage = mapMessage(row);
  if (firstMessage !== null && firstMessage.interestId !== positiveId(row.interest_id, "roommateInterest.id")) {
    throw new RepositoryInvariantError("Roommate interest first message mismatch.");
  }
  return Object.freeze({
    id: positiveId(row.interest_id, "roommateInterest.id"),
    requestId: request.id,
    requestOwnerTenantId,
    interestedTenantId: positiveId(row.interested_tenant_id, "roommateInterest.interestedTenantId"),
    status,
    acceptedAt: nullableTimestamp(row.accepted_at, "roommateInterest.acceptedAt"),
    endedAt: nullableTimestamp(row.ended_at, "roommateInterest.endedAt"),
    endedByTenantId: nullableId(row.ended_by_tenant_id, "roommateInterest.endedByTenantId"),
    terminalReason: terminalReason as RoommateInterestTerminalReason | null,
    createdAt: timestamp(row.interest_created_at, "roommateInterest.createdAt"),
    updatedAt: timestamp(row.interest_updated_at, "roommateInterest.updatedAt"),
    request,
    firstMessage,
    lastMessage:
      row.latest_message_id == null
        ? null
        : mapMessage({
            first_message_id: row.latest_message_id,
            first_message_interest_id: row.latest_message_interest_id,
            first_message_sender_tenant_id: row.latest_message_sender_tenant_id,
            first_message_body: row.latest_message_body,
            first_message_moderation_state: row.latest_message_moderation_state,
            first_message_created_at: row.latest_message_created_at,
            first_message_read_at: row.latest_message_read_at
          }),
    ownerUnreadCount: Number(row.owner_unread_count ?? 0),
    candidateUnreadCount: Number(row.candidate_unread_count ?? 0)
  });
}

function isoDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new RepositoryInvariantError("Roommate time is invalid.");
  return value.toISOString();
}

export interface RoommateDiscoveryCandidateQuery {
  readonly callerTenantId: number;
  readonly now: Date;
  readonly area: string | null;
  readonly budgetMinPerPerson: number | null;
  readonly budgetMaxPerPerson: number | null;
  readonly moveInFrom: string | null;
  readonly moveInUntil: string | null;
  readonly listingMode: "ALL" | "LINKED" | "UNLINKED";
  readonly limit: number;
  readonly offset: number;
}

export interface RoommateRepository {
  readonly findProfile: (
    executor: SqlExecutor,
    tenantId: number,
    forUpdate?: boolean
  ) => Promise<RoommateProfileRecord | null>;
  readonly upsertProfile: (
    executor: SqlExecutor,
    tenantId: number,
    input: RoommateProfileInput
  ) => Promise<RoommateProfileRecord>;
  readonly lockTenant: (executor: SqlExecutor, tenantId: number) => Promise<void>;
  readonly findRequestById: (
    executor: SqlExecutor,
    requestId: number,
    forUpdate?: boolean
  ) => Promise<RoommateRequestRecord | null>;
  readonly findOwnedRequest: (
    executor: SqlExecutor,
    tenantId: number,
    requestId: number,
    forUpdate?: boolean
  ) => Promise<RoommateRequestRecord | null>;
  readonly findOpenRequestForOwner: (
    executor: SqlExecutor,
    tenantId: number,
    forUpdate?: boolean
  ) => Promise<RoommateRequestRecord | null>;
  readonly createRequest: (
    executor: SqlExecutor,
    ownerTenantId: number,
    input: CreateRoommateRequestInput
  ) => Promise<RoommateRequestRecord>;
  readonly updateRequest: (
    executor: SqlExecutor,
    requestId: number,
    input: PatchRoommateRequestInput & { readonly listingId: number | null }
  ) => Promise<RoommateRequestRecord>;
  readonly cancelRequest: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord | null>;
  readonly renewRequest: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord>;
  readonly linkListing: (executor: SqlExecutor, requestId: number, listingId: number) => Promise<RoommateRequestRecord>;
  readonly unlinkListing: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord>;
  readonly listOwnedRequests: (
    executor: SqlExecutor,
    tenantId: number,
    status: RoommateRequestStatus | null,
    limit: number,
    offset: number
  ) => Promise<readonly RoommateRequestRecord[]>;
  readonly listDiscoveryCandidates: (
    executor: SqlExecutor,
    query: RoommateDiscoveryCandidateQuery
  ) => Promise<readonly RoommateDiscoveryCandidate[]>;
  readonly isPairBlocked: (executor: SqlExecutor, firstTenantId: number, secondTenantId: number) => Promise<boolean>;
  readonly hasAcceptedConnection: (executor: SqlExecutor, tenantId: number) => Promise<boolean>;
  readonly materializeExpired: (executor: SqlExecutor, requestId: number, now: Date) => Promise<boolean>;
  readonly sweepExpired: (executor: SqlExecutor, now: Date, limit: number) => Promise<number>;
  readonly createDueExpiryReminders: (
    executor: SqlExecutor,
    now: Date,
    reminderLeadDays: number,
    limit: number
  ) => Promise<number>;
  readonly rejectPendingInterests: (
    executor: SqlExecutor,
    requestId: number,
    terminalReason: "REQUEST_CANCELLED" | "REQUEST_EXPIRED"
  ) => Promise<number>;
  readonly findProfiles: (
    executor: SqlExecutor,
    tenantIds: readonly number[],
    forUpdate?: boolean
  ) => Promise<readonly RoommateProfileRecord[]>;
  readonly findInterestById: (
    executor: SqlExecutor,
    interestId: number,
    forUpdate?: boolean
  ) => Promise<RoommateInterestRecord | null>;
  readonly findActiveInterest: (
    executor: SqlExecutor,
    requestId: number,
    interestedTenantId: number,
    forUpdate?: boolean
  ) => Promise<RoommateInterestRecord | null>;
  readonly createInterestWithMessage: (
    executor: SqlExecutor,
    input: { readonly requestId: number; readonly interestedTenantId: number; readonly message: string }
  ) => Promise<RoommateInterestRecord>;
  readonly countPendingOutgoing: (executor: SqlExecutor, interestedTenantId: number, now?: Date) => Promise<number>;
  readonly listIncomingInterests: (
    executor: SqlExecutor,
    requestId: number,
    ownerTenantId: number,
    limit: number,
    offset: number
  ) => Promise<readonly RoommateInterestRecord[]>;
  readonly listInterests: (
    executor: SqlExecutor,
    tenantId: number,
    direction: RoommateInterestDirection,
    status: RoommateInterestStatus | null,
    limit: number,
    offset: number
  ) => Promise<readonly RoommateInterestRecord[]>;
  readonly acceptInterest: (
    executor: SqlExecutor,
    interestId: number,
    requestId: number
  ) => Promise<RoommateInterestRecord | null>;
  readonly matchRequest: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord | null>;
  readonly rejectInterest: (
    executor: SqlExecutor,
    interestId: number,
    actorTenantId: number
  ) => Promise<RoommateInterestRecord | null>;
  readonly withdrawInterest: (
    executor: SqlExecutor,
    interestId: number,
    actorTenantId: number
  ) => Promise<RoommateInterestRecord | null>;
  readonly leaveInterest: (
    executor: SqlExecutor,
    interestId: number,
    actorTenantId: number
  ) => Promise<RoommateInterestRecord | null>;
  readonly cleanupAfterAccept: (
    executor: SqlExecutor,
    acceptedInterestId: number,
    requestId: number,
    participantTenantIds: readonly number[]
  ) => Promise<void>;
  readonly findCurrentConnection: (executor: SqlExecutor, tenantId: number) => Promise<RoommateInterestRecord | null>;
}

function ownerPredicate(tenantId: number, requestId: number): readonly unknown[] {
  return [requestId, tenantId];
}

function notificationDedupe(event: string, requestId: number, suffix: string): string {
  return `roommate:${event}:${requestId}:${suffix}`;
}

async function insertExpiryNotification(
  executor: SqlExecutor,
  recipientId: number,
  requestId: number,
  eventType: "ROOMMATE_REQUEST_EXPIRED" | "ROOMMATE_INTEREST_REJECTED",
  interestId: number | null,
  expiresAt: string
): Promise<void> {
  const interestEvent = eventType === "ROOMMATE_INTEREST_REJECTED";
  await executeCommand(executor, {
    text: `
      INSERT INTO notifications (
        recipient_id, event_type, roommate_request_id, roommate_interest_id, resource_path, dedupe_key
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
      RETURNING ${notificationRealtimeNotifyExpression}
    `,
    values: [
      recipientId,
      eventType,
      interestEvent ? null : requestId,
      interestId,
      interestId === null ? `/roommate-requests/${requestId}` : `/roommate-interests/${interestId}`,
      notificationDedupe(eventType, requestId, interestId === null ? expiresAt : String(interestId))
    ]
  });
}

async function insertInterestNotification(
  executor: SqlExecutor,
  recipientId: number,
  interestId: number,
  eventType:
    | "ROOMMATE_INTEREST_RECEIVED"
    | "ROOMMATE_INTEREST_ACCEPTED"
    | "ROOMMATE_INTEREST_REJECTED"
    | "ROOMMATE_INTEREST_WITHDRAWN"
    | "ROOMMATE_CONNECTION_LEFT"
): Promise<void> {
  await executeCommand(executor, {
    text: `
      INSERT INTO notifications (
        recipient_id, event_type, roommate_interest_id, resource_path, dedupe_key
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      RETURNING ${notificationRealtimeNotifyExpression}
    `,
    values: [
      recipientId,
      eventType,
      interestId,
      `/roommate-interests/${interestId}`,
      notificationDedupe(eventType, interestId, String(recipientId))
    ]
  });
}

export function createRoommateRepository(): RoommateRepository {
  const repository: RoommateRepository = {
    findProfile(executor, tenantId, forUpdate = false) {
      return queryOptional<ProfileRow, RoommateProfileRecord>(
        executor,
        {
          text: `SELECT ${profileColumns} FROM roommate_profiles WHERE tenant_id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [tenantId]
        },
        mapProfile
      );
    },

    upsertProfile(executor, tenantId, input) {
      return queryExactlyOne<ProfileRow, RoommateProfileRecord>(
        executor,
        {
          text: `
            INSERT INTO roommate_profiles (
              tenant_id, intro, sleep_schedule, cleanliness_level, noise_preference,
              smoking_environment, pet_environment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenant_id) DO UPDATE SET
              intro = EXCLUDED.intro,
              sleep_schedule = EXCLUDED.sleep_schedule,
              cleanliness_level = EXCLUDED.cleanliness_level,
              noise_preference = EXCLUDED.noise_preference,
              smoking_environment = EXCLUDED.smoking_environment,
              pet_environment = EXCLUDED.pet_environment,
              updated_at = CASE
                WHEN roommate_profiles.intro IS DISTINCT FROM EXCLUDED.intro
                  OR roommate_profiles.sleep_schedule IS DISTINCT FROM EXCLUDED.sleep_schedule
                  OR roommate_profiles.cleanliness_level IS DISTINCT FROM EXCLUDED.cleanliness_level
                  OR roommate_profiles.noise_preference IS DISTINCT FROM EXCLUDED.noise_preference
                  OR roommate_profiles.smoking_environment IS DISTINCT FROM EXCLUDED.smoking_environment
                  OR roommate_profiles.pet_environment IS DISTINCT FROM EXCLUDED.pet_environment
                THEN CURRENT_TIMESTAMP ELSE roommate_profiles.updated_at END
            RETURNING ${profileColumns}
          `,
          values: [
            tenantId,
            input.intro,
            input.sleepSchedule,
            input.cleanlinessLevel,
            input.noisePreference,
            input.smokingEnvironment,
            input.petEnvironment
          ]
        },
        mapProfile
      );
    },

    findProfiles(executor, tenantIds, forUpdate = false) {
      if (tenantIds.length === 0) return Promise.resolve(Object.freeze([]));
      return queryMany<ProfileRow, RoommateProfileRecord>(
        executor,
        {
          text: `SELECT ${profileColumns} FROM roommate_profiles WHERE tenant_id = ANY($1::integer[]) ${
            forUpdate ? "FOR UPDATE" : ""
          }`,
          values: [[...new Set(tenantIds)]]
        },
        mapProfile
      );
    },

    async lockTenant(executor, tenantId) {
      await executor.query({
        text: "SELECT pg_advisory_xact_lock(hashtextextended('rentmate:roommate:' || $1::text, 0))",
        values: [tenantId]
      });
    },

    findRequestById(executor, requestId, forUpdate = false) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `SELECT ${requestColumns} FROM roommate_requests WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [requestId]
        },
        mapRequest
      );
    },

    findOwnedRequest(executor, tenantId, requestId, forUpdate = false) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `SELECT ${requestColumns} FROM roommate_requests WHERE id = $1 AND owner_tenant_id = $2 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: ownerPredicate(tenantId, requestId)
        },
        mapRequest
      );
    },

    findOpenRequestForOwner(executor, tenantId, forUpdate = false) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            SELECT ${requestColumns}
            FROM roommate_requests
            WHERE owner_tenant_id = $1 AND status = 'OPEN'
            ORDER BY id ASC
            LIMIT 1
            ${forUpdate ? "FOR UPDATE" : ""}
          `,
          values: [tenantId]
        },
        mapRequest
      );
    },

    createRequest(executor, ownerTenantId, input) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            INSERT INTO roommate_requests (
              owner_tenant_id, listing_id, preferred_area_keys, budget_min_per_person,
              budget_max_per_person, move_in_from, move_in_until, note, expires_at, listing_linked_at
            ) VALUES ($1, $2, $3::text[], $4, $5, $6::date, $7::date, $8,
                      CURRENT_TIMESTAMP + INTERVAL '30 days',
                      CASE WHEN $2::integer IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
            RETURNING ${requestColumns}
          `,
          values: [
            ownerTenantId,
            input.listingId,
            [...input.preferredAreaKeys],
            input.budgetMinPerPerson,
            input.budgetMaxPerPerson,
            input.moveInFrom,
            input.moveInUntil,
            input.note
          ]
        },
        mapRequest
      );
    },

    updateRequest(executor, requestId, input) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET preferred_area_keys = $2::text[],
                budget_min_per_person = $3,
                budget_max_per_person = $4,
                move_in_from = $5::date,
                move_in_until = $6::date,
                note = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [
            requestId,
            [...(input.preferredAreaKeys ?? [])],
            input.budgetMinPerPerson,
            input.budgetMaxPerPerson,
            input.moveInFrom,
            input.moveInUntil,
            input.note
          ]
        },
        mapRequest
      );
    },

    cancelRequest(executor, requestId) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    renewRequest(executor, requestId) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'OPEN', expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'EXPIRED'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    linkListing(executor, requestId, listingId) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET listing_id = $2, listing_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId, listingId]
        },
        mapRequest
      );
    },

    unlinkListing(executor, requestId) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET listing_id = NULL, listing_linked_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    listOwnedRequests(executor, tenantId, status, limit, offset) {
      const values: unknown[] = [tenantId];
      const statusClause = status === null ? "" : ` AND status = $${values.push(status)}`;
      const limitIndex = values.push(limit + 1);
      const offsetIndex = values.push(offset);
      return queryMany<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            SELECT ${requestColumns}
            FROM roommate_requests
            WHERE owner_tenant_id = $1${statusClause}
            ORDER BY created_at DESC, id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapRequest
      );
    },

    listDiscoveryCandidates(executor, query) {
      const values: unknown[] = [query.callerTenantId, isoDate(query.now)];
      const conditions = [
        "r.owner_tenant_id <> $1",
        "r.status = 'OPEN'",
        "r.moderation_state = 'VISIBLE'",
        "r.expires_at > $2::timestamptz",
        "p.moderation_state = 'VISIBLE'",
        "NOT EXISTS (SELECT 1 FROM contact_blocks b WHERE (b.blocker_id = r.owner_tenant_id AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = r.owner_tenant_id))"
      ];
      if (query.listingMode === "LINKED") conditions.push("r.listing_id IS NOT NULL");
      if (query.listingMode === "UNLINKED") conditions.push("r.listing_id IS NULL");
      if (query.area !== null) {
        const index = values.push(areaSearchTerms(query.area));
        conditions.push(
          `(r.listing_id IS NOT NULL OR EXISTS (SELECT 1 FROM unnest(r.preferred_area_keys) AS area_key CROSS JOIN unnest($${index}::text[]) AS search_term(value) WHERE position(lower(search_term.value) in lower(area_key)) > 0))`
        );
      }
      if (query.budgetMinPerPerson !== null) {
        const index = values.push(query.budgetMinPerPerson);
        conditions.push(`r.budget_max_per_person >= $${index}`);
      }
      if (query.budgetMaxPerPerson !== null) {
        const index = values.push(query.budgetMaxPerPerson);
        conditions.push(`r.budget_min_per_person <= $${index}`);
      }
      if (query.moveInFrom !== null) {
        const index = values.push(query.moveInFrom);
        conditions.push(`r.move_in_until >= $${index}::date`);
      }
      if (query.moveInUntil !== null) {
        const index = values.push(query.moveInUntil);
        conditions.push(`r.move_in_from <= $${index}::date`);
      }
      const limitIndex = values.push(query.limit);
      const offsetIndex = values.push(query.offset);
      return queryMany<CandidateRow, RoommateDiscoveryCandidate>(
        executor,
        {
          text: `
            SELECT
              r.id, r.owner_tenant_id, r.listing_id, r.preferred_area_keys,
              r.budget_min_per_person, r.budget_max_per_person, r.move_in_from,
              r.move_in_until, r.note, r.status, r.expires_at, r.listing_linked_at,
              r.moderation_state, r.created_at, r.updated_at,
              p.tenant_id AS profile_tenant_id, p.intro AS profile_intro,
              p.sleep_schedule AS profile_sleep_schedule,
              p.cleanliness_level AS profile_cleanliness_level,
              p.noise_preference AS profile_noise_preference,
              p.smoking_environment AS profile_smoking_environment,
              p.pet_environment AS profile_pet_environment,
              p.moderation_state AS profile_moderation_state,
              p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
            FROM roommate_requests r
            JOIN roommate_profiles p ON p.tenant_id = r.owner_tenant_id
            WHERE ${conditions.join(" AND ")}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapCandidate
      );
    },

    findInterestById(executor, interestId, forUpdate = false) {
      return queryOptional<InterestRow, RoommateInterestRecord>(
        executor,
        {
          text: `SELECT ${interestColumns} ${interestFrom} WHERE i.id = $1 ${forUpdate ? "FOR UPDATE OF i, r" : ""}`,
          values: [interestId]
        },
        mapInterest
      );
    },

    findActiveInterest(executor, requestId, interestedTenantId, forUpdate = false) {
      return queryOptional<InterestRow, RoommateInterestRecord>(
        executor,
        {
          text: `
            SELECT ${interestColumns}
            ${interestFrom}
            WHERE i.request_id = $1
              AND i.interested_tenant_id = $2
              AND i.status IN ('PENDING', 'ACCEPTED')
            ORDER BY i.id ASC
            LIMIT 1
            ${forUpdate ? "FOR UPDATE OF i, r" : ""}
          `,
          values: [requestId, interestedTenantId]
        },
        mapInterest
      );
    },

    async createInterestWithMessage(executor, input) {
      const inserted = await queryExactlyOne<InterestIdRow, { readonly id: number }>(
        executor,
        {
          text: `
            INSERT INTO roommate_interests (request_id, interested_tenant_id)
            VALUES ($1, $2)
            RETURNING id
          `,
          values: [input.requestId, input.interestedTenantId]
        },
        (row) => Object.freeze({ id: positiveId(row.id, "roommateInterest.id") })
      );
      await executeCommand(executor, {
        text: `
          INSERT INTO roommate_messages (interest_id, sender_tenant_id, body)
          VALUES ($1, $2, $3)
        `,
        values: [inserted.id, input.interestedTenantId, input.message]
      });
      const interest = await repository.findInterestById(executor, inserted.id);
      if (!interest) throw new RepositoryInvariantError("Created roommate interest could not be loaded.");
      await insertInterestNotification(
        executor,
        interest.requestOwnerTenantId,
        interest.id,
        "ROOMMATE_INTEREST_RECEIVED"
      );
      return interest;
    },

    async countPendingOutgoing(executor, interestedTenantId, now = new Date()) {
      const result = await queryExactlyOne<CountRow, number>(
        executor,
        {
          text: `
            SELECT count(*)::integer AS count
            FROM roommate_interests i
            JOIN roommate_requests r ON r.id = i.request_id
            WHERE i.interested_tenant_id = $1
              AND i.status = 'PENDING'
              AND r.status = 'OPEN'
              AND r.expires_at > $2::timestamptz
          `,
          values: [interestedTenantId, isoDate(now)]
        },
        (row) => {
          const value = typeof row.count === "number" ? row.count : Number(row.count);
          if (!Number.isSafeInteger(value) || value < 0)
            throw new RepositoryInvariantError("Interest count is invalid.");
          return value;
        }
      );
      return result;
    },

    listIncomingInterests(executor, requestId, ownerTenantId, limit, offset) {
      return queryMany<InterestRow, RoommateInterestRecord>(
        executor,
        {
          text: `
            SELECT ${interestColumns}
            ${interestFrom}
            WHERE i.request_id = $1
              AND r.owner_tenant_id = $2
              AND NOT EXISTS (
                SELECT 1 FROM contact_blocks b
                WHERE (b.blocker_id = r.owner_tenant_id AND b.blocked_id = i.interested_tenant_id)
                   OR (b.blocker_id = i.interested_tenant_id AND b.blocked_id = r.owner_tenant_id)
              )
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT $3 OFFSET $4
          `,
          values: [requestId, ownerTenantId, limit, offset]
        },
        mapInterest
      );
    },

    listInterests(executor, tenantId, direction, status, limit, offset) {
      const values: unknown[] = [tenantId];
      const conditions = [
        direction === "INCOMING" ? "r.owner_tenant_id = $1" : "i.interested_tenant_id = $1",
        `NOT EXISTS (
          SELECT 1 FROM contact_blocks b
          WHERE (b.blocker_id = r.owner_tenant_id AND b.blocked_id = i.interested_tenant_id)
             OR (b.blocker_id = i.interested_tenant_id AND b.blocked_id = r.owner_tenant_id)
        )`
      ];
      if (status !== null) conditions.push(`i.status = $${values.push(status)}`);
      const limitIndex = values.push(limit);
      const offsetIndex = values.push(offset);
      return queryMany<InterestRow, RoommateInterestRecord>(
        executor,
        {
          text: `
            SELECT ${interestColumns}
            ${interestFrom}
            WHERE ${conditions.join(" AND ")}
            ORDER BY i.updated_at DESC, i.id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapInterest
      );
    },

    async acceptInterest(executor, interestId, requestId) {
      const result = await executor.query<InterestIdRow>({
        text: `
          UPDATE roommate_interests
          SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND request_id = $2 AND status = 'PENDING'
          RETURNING id
        `,
        values: [interestId, requestId]
      });
      if (result.rows.length === 0) return null;
      const interest = await repository.findInterestById(
        executor,
        positiveId(result.rows[0]!.id, "roommateInterest.id")
      );
      if (!interest) throw new RepositoryInvariantError("Accepted roommate interest could not be loaded.");
      await insertInterestNotification(
        executor,
        interest.interestedTenantId,
        interest.id,
        "ROOMMATE_INTEREST_ACCEPTED"
      );
      return interest;
    },

    matchRequest(executor, requestId) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'MATCHED', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    async rejectInterest(executor, interestId, actorTenantId) {
      const result = await executor.query<InterestIdRow>({
        text: `
          UPDATE roommate_interests i
          SET status = 'REJECTED', ended_at = CURRENT_TIMESTAMP,
              ended_by_tenant_id = $2, terminal_reason = 'USER_ACTION', updated_at = CURRENT_TIMESTAMP
          FROM roommate_requests r
          WHERE i.id = $1 AND i.request_id = r.id
            AND r.owner_tenant_id = $2 AND i.status = 'PENDING'
          RETURNING i.id
        `,
        values: [interestId, actorTenantId]
      });
      if (result.rows.length === 0) return null;
      const interest = await repository.findInterestById(
        executor,
        positiveId(result.rows[0]!.id, "roommateInterest.id")
      );
      if (!interest) throw new RepositoryInvariantError("Rejected roommate interest could not be loaded.");
      await insertInterestNotification(
        executor,
        interest.interestedTenantId,
        interest.id,
        "ROOMMATE_INTEREST_REJECTED"
      );
      return interest;
    },

    async withdrawInterest(executor, interestId, actorTenantId) {
      const result = await executor.query<InterestIdRow>({
        text: `
          UPDATE roommate_interests
          SET status = 'WITHDRAWN', ended_at = CURRENT_TIMESTAMP,
              ended_by_tenant_id = $2, terminal_reason = 'USER_ACTION', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND interested_tenant_id = $2 AND status = 'PENDING'
          RETURNING id
        `,
        values: [interestId, actorTenantId]
      });
      if (result.rows.length === 0) return null;
      const interest = await repository.findInterestById(
        executor,
        positiveId(result.rows[0]!.id, "roommateInterest.id")
      );
      if (!interest) throw new RepositoryInvariantError("Withdrawn roommate interest could not be loaded.");
      await insertInterestNotification(
        executor,
        interest.requestOwnerTenantId,
        interest.id,
        "ROOMMATE_INTEREST_WITHDRAWN"
      );
      return interest;
    },

    async leaveInterest(executor, interestId, actorTenantId) {
      const result = await executor.query<InterestIdRow>({
        text: `
          UPDATE roommate_interests i
          SET status = 'LEFT', ended_at = CURRENT_TIMESTAMP,
              ended_by_tenant_id = $2, terminal_reason = 'USER_ACTION', updated_at = CURRENT_TIMESTAMP
          FROM roommate_requests r
          WHERE i.id = $1 AND i.request_id = r.id
            AND (r.owner_tenant_id = $2 OR i.interested_tenant_id = $2)
            AND i.status = 'ACCEPTED'
          RETURNING i.id
        `,
        values: [interestId, actorTenantId]
      });
      if (result.rows.length === 0) return null;
      const interest = await repository.findInterestById(
        executor,
        positiveId(result.rows[0]!.id, "roommateInterest.id")
      );
      if (!interest) throw new RepositoryInvariantError("Left roommate interest could not be loaded.");
      await insertInterestNotification(
        executor,
        interest.requestOwnerTenantId === actorTenantId ? interest.interestedTenantId : interest.requestOwnerTenantId,
        interest.id,
        "ROOMMATE_CONNECTION_LEFT"
      );
      return interest;
    },

    async cleanupAfterAccept(executor, acceptedInterestId, requestId, participantTenantIds) {
      const rejected = await queryMany<
        { id: unknown; interested_tenant_id: unknown },
        { readonly id: number; readonly interestedTenantId: number }
      >(
        executor,
        {
          text: `
          UPDATE roommate_interests
          SET status = 'REJECTED', ended_at = CURRENT_TIMESTAMP,
              terminal_reason = 'COMPETING_INTEREST_ACCEPTED', updated_at = CURRENT_TIMESTAMP
          WHERE request_id = $1 AND status = 'PENDING' AND id <> $2
          RETURNING id, interested_tenant_id
        `,
          values: [requestId, acceptedInterestId]
        },
        (row) => ({
          id: positiveId(row.id, "roommateInterest.id"),
          interestedTenantId: positiveId(row.interested_tenant_id, "roommateInterest.interestedTenantId")
        })
      );
      for (const row of rejected) {
        await insertInterestNotification(executor, row.interestedTenantId, row.id, "ROOMMATE_INTEREST_REJECTED");
      }
      const withdrawn = await queryMany<
        { id: unknown; interested_tenant_id: unknown; owner_tenant_id: unknown },
        { readonly id: number; readonly interestedTenantId: number; readonly ownerTenantId: number }
      >(
        executor,
        {
          text: `
          UPDATE roommate_interests i
          SET status = 'WITHDRAWN', ended_at = CURRENT_TIMESTAMP,
              terminal_reason = 'PARTICIPANT_MATCHED_ELSEWHERE', updated_at = CURRENT_TIMESTAMP
          FROM roommate_requests r
          WHERE i.request_id = r.id
            AND i.interested_tenant_id = ANY($1::integer[])
            AND i.status = 'PENDING' AND i.id <> $2 AND i.request_id <> $3
          RETURNING i.id, i.interested_tenant_id, r.owner_tenant_id
        `,
          values: [[...new Set(participantTenantIds)], acceptedInterestId, requestId]
        },
        (row) => ({
          id: positiveId(row.id, "roommateInterest.id"),
          interestedTenantId: positiveId(row.interested_tenant_id, "roommateInterest.interestedTenantId"),
          ownerTenantId: positiveId(row.owner_tenant_id, "roommateRequest.ownerTenantId")
        })
      );
      for (const row of withdrawn) {
        await insertInterestNotification(executor, row.ownerTenantId, row.id, "ROOMMATE_INTEREST_WITHDRAWN");
      }
    },

    findCurrentConnection(executor, tenantId) {
      return queryOptional<InterestRow, RoommateInterestRecord>(
        executor,
        {
          text: `
            SELECT ${interestColumns}
            ${interestFrom}
            WHERE i.status = 'ACCEPTED'
              AND (r.owner_tenant_id = $1 OR i.interested_tenant_id = $1)
            ORDER BY i.accepted_at DESC, i.id DESC
            LIMIT 1
          `,
          values: [tenantId]
        },
        mapInterest
      );
    },

    async isPairBlocked(executor, firstTenantId, secondTenantId) {
      const result = await queryExactlyOne<{ value: unknown }, boolean>(
        executor,
        {
          text: `
            SELECT EXISTS (
              SELECT 1 FROM contact_blocks
              WHERE (blocker_id = $1 AND blocked_id = $2)
                 OR (blocker_id = $2 AND blocked_id = $1)
            ) AS value
          `,
          values: [firstTenantId, secondTenantId]
        },
        (row) => {
          if (typeof row.value !== "boolean") throw new RepositoryInvariantError("Roommate block result is invalid.");
          return row.value;
        }
      );
      return result;
    },

    async hasAcceptedConnection(executor, tenantId) {
      const result = await queryExactlyOne<{ value: unknown }, boolean>(
        executor,
        {
          text: `
            SELECT EXISTS (
              SELECT 1 FROM roommate_interests i
              JOIN roommate_requests r ON r.id = i.request_id
              WHERE i.status = 'ACCEPTED'
                AND (i.interested_tenant_id = $1 OR r.owner_tenant_id = $1)
            ) AS value
          `,
          values: [tenantId]
        },
        (row) => {
          if (typeof row.value !== "boolean")
            throw new RepositoryInvariantError("Roommate connection result is invalid.");
          return row.value;
        }
      );
      return result;
    },

    async materializeExpired(executor, requestId, now) {
      const row = await queryOptional<
        ExpiredRequestRow,
        { readonly id: number; readonly ownerTenantId: number; readonly expiresAt: string }
      >(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN' AND expires_at <= $2::timestamptz
            RETURNING id, owner_tenant_id, expires_at
          `,
          values: [requestId, isoDate(now)]
        },
        (value) =>
          Object.freeze({
            id: positiveId(value.id, "roommateRequest.id"),
            ownerTenantId: positiveId(value.owner_tenant_id, "roommateRequest.ownerTenantId"),
            expiresAt: timestamp(value.expires_at, "roommateRequest.expiresAt")
          })
      );
      if (!row) return false;
      await repository.rejectPendingInterests(executor, row.id, "REQUEST_EXPIRED");
      await insertExpiryNotification(
        executor,
        row.ownerTenantId,
        row.id,
        "ROOMMATE_REQUEST_EXPIRED",
        null,
        row.expiresAt
      );
      return true;
    },

    async sweepExpired(executor, now, limit) {
      const rows = await queryMany<ExpiredRequestRow, { readonly id: number }>(
        executor,
        {
          text: `
            SELECT id
            FROM roommate_requests
            WHERE status = 'OPEN' AND expires_at <= $1::timestamptz
            ORDER BY expires_at ASC, id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          `,
          values: [isoDate(now), limit]
        },
        (row) => ({ id: positiveId(row.id, "roommateRequest.id") })
      );
      let count = 0;
      for (const row of rows) {
        if (await repository.materializeExpired(executor, row.id, now)) count += 1;
      }
      return count;
    },

    async createDueExpiryReminders(executor, now, reminderLeadDays, limit) {
      const rows = await queryMany<
        ExpiredRequestRow,
        { readonly id: number; readonly ownerTenantId: number; readonly expiresAt: string }
      >(
        executor,
        {
          text: `
            SELECT id, owner_tenant_id, expires_at
            FROM roommate_requests
            WHERE status = 'OPEN'
              AND expires_at > $1::timestamptz
              AND expires_at <= $1::timestamptz + ($2::integer * INTERVAL '1 day')
            ORDER BY expires_at ASC, id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          `,
          values: [isoDate(now), reminderLeadDays, limit]
        },
        (row) => ({
          id: positiveId(row.id, "roommateRequest.id"),
          ownerTenantId: positiveId(row.owner_tenant_id, "roommateRequest.ownerTenantId"),
          expiresAt: timestamp(row.expires_at, "roommateRequest.expiresAt")
        })
      );
      let created = 0;
      for (const row of rows) {
        const inserted = await executeCommand(executor, {
          text: `
            INSERT INTO notifications (
              recipient_id, event_type, roommate_request_id, resource_path, dedupe_key
            ) VALUES ($1, 'ROOMMATE_REQUEST_EXPIRING', $2, $3, $4)
            ON CONFLICT DO NOTHING
            RETURNING ${notificationRealtimeNotifyExpression}
          `,
          values: [
            row.ownerTenantId,
            row.id,
            `/roommate-requests/${row.id}`,
            notificationDedupe("ROOMMATE_REQUEST_EXPIRING", row.id, row.expiresAt)
          ]
        });
        created += inserted;
      }
      return created;
    },

    async rejectPendingInterests(executor, requestId, terminalReason) {
      const rows = await queryMany<PendingInterestRow, { readonly id: number; readonly interestedTenantId: number }>(
        executor,
        {
          text: `
            UPDATE roommate_interests
            SET status = 'REJECTED', ended_at = CURRENT_TIMESTAMP,
                terminal_reason = $2, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $1 AND status = 'PENDING'
            RETURNING id, interested_tenant_id
          `,
          values: [requestId, terminalReason]
        },
        (row) => ({
          id: positiveId(row.id, "roommateInterest.id"),
          interestedTenantId: positiveId(row.interested_tenant_id, "roommateInterest.interestedTenantId")
        })
      );
      for (const row of rows) {
        await insertExpiryNotification(
          executor,
          row.interestedTenantId,
          requestId,
          "ROOMMATE_INTEREST_REJECTED",
          row.id,
          terminalReason
        );
      }
      return rows.length;
    }
  };
  return Object.freeze(repository);
}

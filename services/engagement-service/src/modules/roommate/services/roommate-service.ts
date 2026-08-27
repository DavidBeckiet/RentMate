import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { IdentityRoommateTenantProjection } from "../../../../../shared/identity-account-client.js";
import type { ListingCatalogClient } from "../../../../../shared/listing-catalog-client.js";
import type { PublicListingSummary } from "../../../../../shared/public-listing-summary.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type {
  CleanlinessLevel,
  CreateRoommateRequestInput,
  NoisePreference,
  PatchRoommateRequestInput,
  RoommateDiscoveryQuery,
  RoommateProfileInput,
  RoommateRequestStatus,
  SleepSchedule,
  SmokingEnvironment,
  PetEnvironment
} from "../validations/roommate-validation.js";
import { roommateBusinessDate, validateRoommateRequestContent } from "../validations/roommate-validation.js";
import type {
  RoommateDiscoveryCandidate,
  RoommateProfileRecord,
  RoommateRepository,
  RoommateRequestRecord
} from "../repositories/roommate-repository.js";

const notFoundMessage = "The requested resource was not found.";
const requestNotOpenMessage = "This roommate request is no longer open.";
const requestExpiredMessage = "This roommate request has expired.";
const dependencyUnavailableMessage = "A required service is temporarily unavailable.";

export interface RoommateProfileView {
  readonly intro: string;
  readonly sleepSchedule: SleepSchedule;
  readonly cleanlinessLevel: CleanlinessLevel;
  readonly noisePreference: NoisePreference;
  readonly smokingEnvironment: SmokingEnvironment;
  readonly petEnvironment: PetEnvironment;
  readonly displayName: string | null;
  readonly memberSince: string;
  readonly profileCompleted: boolean;
}

export interface RoommateRequestView {
  readonly id: number;
  readonly listingId: number | null;
  readonly listingMode: "LINKED" | "UNLINKED";
  readonly preferredAreaKeys: readonly string[];
  readonly budgetMinPerPerson: number;
  readonly budgetMaxPerPerson: number;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly note: string | null;
  readonly status: RoommateRequestStatus;
  readonly expiresAt: string;
  readonly listingLinkedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly profile: RoommateProfileView | null;
  readonly listing: PublicListingSummary | null;
  readonly signals: Readonly<{
    readonly profileCompleted: boolean;
    readonly requestOpen: boolean;
    readonly listingCurrentlyAvailable: boolean | null;
  }>;
}

export interface RoommatePage<Value> {
  readonly data: readonly Value[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface RoommateTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface RoommateService {
  readonly getProfile: (principal: AuthenticatedPrincipal) => Promise<RoommateProfileView>;
  readonly upsertProfile: (
    principal: AuthenticatedPrincipal,
    input: RoommateProfileInput
  ) => Promise<RoommateProfileView>;
  readonly createRequest: (
    principal: AuthenticatedPrincipal,
    input: CreateRoommateRequestInput
  ) => Promise<RoommateRequestView>;
  readonly listDiscovery: (
    principal: AuthenticatedPrincipal,
    query: RoommateDiscoveryQuery
  ) => Promise<RoommatePage<RoommateRequestView>>;
  readonly listMine: (
    principal: AuthenticatedPrincipal,
    query: {
      readonly status: RoommateRequestStatus | null;
      readonly page: number;
      readonly pageSize: number;
      readonly offset: number;
    }
  ) => Promise<RoommatePage<RoommateRequestView>>;
  readonly getRequest: (principal: AuthenticatedPrincipal, requestId: number) => Promise<RoommateRequestView>;
  readonly updateRequest: (
    principal: AuthenticatedPrincipal,
    requestId: number,
    input: PatchRoommateRequestInput
  ) => Promise<RoommateRequestView>;
  readonly cancelRequest: (principal: AuthenticatedPrincipal, requestId: number) => Promise<RoommateRequestView>;
  readonly renewRequest: (principal: AuthenticatedPrincipal, requestId: number) => Promise<RoommateRequestView>;
  readonly linkListing: (
    principal: AuthenticatedPrincipal,
    requestId: number,
    listingId: number
  ) => Promise<RoommateRequestView>;
  readonly unlinkListing: (principal: AuthenticatedPrincipal, requestId: number) => Promise<RoommateRequestView>;
}

interface RoommateDependencies {
  readonly repository: RoommateRepository;
  readonly identityAccountClient: Pick<
    import("../../../../../shared/identity-account-client.js").IdentityAccountClient,
    "loadRoommateTenantProjectionsByIds"
  >;
  readonly listingCatalogClient: Pick<ListingCatalogClient, "loadPublicSummariesByIds">;
  readonly transactionRunner: RoommateTransactionRunner;
  readonly now?: () => Date;
}

function requireTenant(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "TENANT") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function validationProfileIncomplete(): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", "A complete visible roommate profile is required.", {
    details: [
      {
        field: "profile",
        code: "REQUIRED",
        message: "Complete and save the roommate profile before continuing."
      }
    ]
  });
}

function roommateError(
  code:
    | "ROOMMATE_OPEN_REQUEST_EXISTS"
    | "ROOMMATE_ACTIVE_CONNECTION_EXISTS"
    | "ROOMMATE_REQUEST_NOT_OPEN"
    | "ROOMMATE_REQUEST_EXPIRED"
    | "ROOMMATE_LISTING_INELIGIBLE",
  message: string
): ApplicationError {
  return new ApplicationError(code, message);
}

function mapDependencyError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError && error.code === "DEPENDENCY_UNAVAILABLE") return error;
  return new ApplicationError("DEPENDENCY_UNAVAILABLE", dependencyUnavailableMessage, { cause: error });
}

function isExpired(request: RoommateRequestRecord, now: Date): boolean {
  return new Date(request.expiresAt).getTime() <= now.getTime();
}

function profileComplete(profile: RoommateProfileRecord | null): profile is RoommateProfileRecord {
  if (profile === null || profile.moderationState !== "VISIBLE" || typeof profile.intro !== "string") return false;
  const introLength = [...profile.intro].length;
  if (introLength < 20 || introLength > 500) return false;
  for (const character of profile.intro) {
    if (character !== "\n" && /\p{Cc}/u.test(character)) return false;
  }
  return (
    ["EARLY", "STANDARD", "LATE", "FLEXIBLE"].includes(profile.sleepSchedule) &&
    ["RELAXED", "BALANCED", "TIDY"].includes(profile.cleanlinessLevel) &&
    ["QUIET", "BALANCED", "SOCIAL"].includes(profile.noisePreference) &&
    ["SMOKE_FREE", "OUTDOOR_ONLY", "NO_PREFERENCE"].includes(profile.smokingEnvironment) &&
    ["NO_PETS", "OK_WITH_PETS", "HAS_PET"].includes(profile.petEnvironment)
  );
}

function publicProfile(
  profile: RoommateProfileRecord,
  identity: IdentityRoommateTenantProjection
): RoommateProfileView {
  return Object.freeze({
    intro: profile.intro,
    sleepSchedule: profile.sleepSchedule,
    cleanlinessLevel: profile.cleanlinessLevel,
    noisePreference: profile.noisePreference,
    smokingEnvironment: profile.smokingEnvironment,
    petEnvironment: profile.petEnvironment,
    displayName: identity.displayName,
    memberSince: identity.memberSince,
    profileCompleted: profileComplete(profile) && identity.role === "TENANT" && identity.isActive
  });
}

function publicIdentity(
  identity: readonly IdentityRoommateTenantProjection[],
  tenantId: number
): IdentityRoommateTenantProjection | null {
  return identity.find((candidate) => candidate.tenantId === tenantId) ?? null;
}

function validateProjection(
  projection: IdentityRoommateTenantProjection | null,
  expectedTenantId: number,
  requiredActive = true
): projection is IdentityRoommateTenantProjection {
  return (
    projection !== null &&
    projection.tenantId === expectedTenantId &&
    projection.role === "TENANT" &&
    (projection.displayName === null || typeof projection.displayName === "string") &&
    typeof projection.isActive === "boolean" &&
    /^(?:[0-9]{4})-(?:0[1-9]|1[0-2])$/u.test(projection.memberSince) &&
    (!requiredActive || projection.isActive)
  );
}

function sameAreas(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameContent(
  left: RoommateRequestRecord,
  right: CreateRoommateRequestInput & { readonly listingId: number | null }
): boolean {
  return (
    left.listingId === right.listingId &&
    sameAreas(left.preferredAreaKeys, right.preferredAreaKeys) &&
    left.budgetMinPerPerson === right.budgetMinPerPerson &&
    left.budgetMaxPerPerson === right.budgetMaxPerPerson &&
    left.moveInFrom === right.moveInFrom &&
    left.moveInUntil === right.moveInUntil &&
    left.note === right.note
  );
}

function matchesLocalDiscoveryFilters(candidate: RoommateDiscoveryCandidate, query: RoommateDiscoveryQuery): boolean {
  if (query.listingMode === "LINKED" && candidate.listingId === null) return false;
  if (query.listingMode === "UNLINKED" && candidate.listingId !== null) return false;
  if (query.budgetMinPerPerson !== null && candidate.budgetMaxPerPerson < query.budgetMinPerPerson) return false;
  if (query.budgetMaxPerPerson !== null && candidate.budgetMinPerPerson > query.budgetMaxPerPerson) return false;
  if (query.moveInFrom !== null && candidate.moveInUntil < query.moveInFrom) return false;
  if (query.moveInUntil !== null && candidate.moveInFrom > query.moveInUntil) return false;
  if (query.area !== null && candidate.listingId === null) {
    const normalizedArea = query.area.toLocaleLowerCase("vi-VN");
    if (!candidate.preferredAreaKeys.some((area) => area.toLocaleLowerCase("vi-VN").includes(normalizedArea))) {
      return false;
    }
  }
  return true;
}

export function createRoommateService(dependencies: RoommateDependencies): RoommateService {
  const {
    repository,
    identityAccountClient,
    listingCatalogClient,
    transactionRunner,
    now = () => new Date()
  } = dependencies;

  const loadIdentity = async (tenantIds: readonly number[]): Promise<readonly IdentityRoommateTenantProjection[]> => {
    if (tenantIds.length === 0) return Object.freeze([]);
    try {
      return await identityAccountClient.loadRoommateTenantProjectionsByIds(tenantIds);
    } catch (error) {
      throw mapDependencyError(error);
    }
  };

  const loadListingMap = async (listingIds: readonly number[]): Promise<ReadonlyMap<number, PublicListingSummary>> => {
    if (listingIds.length === 0) return new Map();
    let summaries: readonly PublicListingSummary[];
    try {
      summaries = await listingCatalogClient.loadPublicSummariesByIds(listingIds);
    } catch (error) {
      throw mapDependencyError(error);
    }
    return new Map(
      summaries
        .filter(
          (summary) =>
            (summary.businessStatus === "AVAILABLE" || summary.businessStatus === "UNKNOWN") &&
            summary.maxOccupants !== null &&
            Number.isInteger(summary.maxOccupants) &&
            summary.maxOccupants >= 2
        )
        .map((summary) => [summary.id, summary] as const)
    );
  };

  const requireEligibleListing = async (listingId: number): Promise<PublicListingSummary> => {
    const listingMap = await loadListingMap([listingId]);
    const listing = listingMap.get(listingId);
    if (!listing)
      throw roommateError("ROOMMATE_LISTING_INELIGIBLE", "The selected listing is not eligible for roommate matching.");
    return listing;
  };

  const loadProfileView = async (profile: RoommateProfileRecord): Promise<RoommateProfileView> => {
    const projections = await loadIdentity([profile.tenantId]);
    const identity = publicIdentity(projections, profile.tenantId);
    if (!validateProjection(identity, profile.tenantId, false))
      throw mapDependencyError(new Error("Identity projection is missing."));
    return publicProfile(profile, identity);
  };

  const decorate = async (
    records: readonly RoommateRequestRecord[],
    profileByTenant?: ReadonlyMap<number, RoommateProfileRecord>,
    identityProjections?: readonly IdentityRoommateTenantProjection[],
    listingMap?: ReadonlyMap<number, PublicListingSummary>
  ): Promise<readonly RoommateRequestView[]> => {
    if (records.length === 0) return Object.freeze([]);
    const profiles = profileByTenant ?? new Map<number, RoommateProfileRecord>();
    const identities =
      identityProjections ?? (await loadIdentity([...new Set(records.map((record) => record.ownerTenantId))]));
    const listings =
      listingMap ??
      (await loadListingMap([
        ...new Set(records.flatMap((record) => (record.listingId === null ? [] : [record.listingId])))
      ]));
    const currentTime = now();
    return Object.freeze(
      records.map((record) => {
        const profile = profiles.get(record.ownerTenantId);
        const identity = publicIdentity(identities, record.ownerTenantId);
        const validIdentity = validateProjection(identity, record.ownerTenantId, false) ? identity : null;
        const visibleProfile =
          profile && profileComplete(profile) && validIdentity ? publicProfile(profile, validIdentity) : null;
        const listing = record.listingId === null ? null : (listings.get(record.listingId) ?? null);
        return Object.freeze({
          id: record.id,
          listingId: record.listingId,
          listingMode: record.listingId === null ? "UNLINKED" : "LINKED",
          preferredAreaKeys: Object.freeze([...record.preferredAreaKeys]),
          budgetMinPerPerson: record.budgetMinPerPerson,
          budgetMaxPerPerson: record.budgetMaxPerPerson,
          moveInFrom: record.moveInFrom,
          moveInUntil: record.moveInUntil,
          note: record.note,
          status: record.status,
          expiresAt: record.expiresAt,
          listingLinkedAt: record.listingLinkedAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          profile: visibleProfile,
          listing,
          signals: Object.freeze({
            profileCompleted: visibleProfile?.profileCompleted === true,
            requestOpen: record.status === "OPEN" && new Date(record.expiresAt).getTime() > currentTime.getTime(),
            listingCurrentlyAvailable: record.listingId === null ? null : listing !== null
          })
        });
      })
    );
  };

  const expireIfNeeded = async (
    executor: SqlExecutor,
    request: RoommateRequestRecord
  ): Promise<RoommateRequestRecord | null> => {
    const currentTime = now();
    if (request.status !== "OPEN" || !isExpired(request, currentTime)) return request;
    await repository.materializeExpired(executor, request.id, currentTime);
    return repository.findRequestById(executor, request.id, true);
  };

  const requireComplete = async (executor: SqlExecutor, tenantId: number): Promise<RoommateProfileRecord> => {
    const profile = await repository.findProfile(executor, tenantId, true);
    if (!profileComplete(profile)) throw validationProfileIncomplete();
    return profile;
  };

  const prepareOwnerRequest = async (
    executor: SqlExecutor,
    tenantId: number,
    requestId: number
  ): Promise<RoommateRequestRecord> => {
    const request = await repository.findOwnedRequest(executor, tenantId, requestId, true);
    if (!request) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    const current = await expireIfNeeded(executor, request);
    if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    return current;
  };

  const service: RoommateService = {
    async getProfile(principal) {
      const tenantId = requireTenant(principal);
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      if (!profile) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      return loadProfileView(profile);
    },

    async upsertProfile(principal, input) {
      const tenantId = requireTenant(principal);
      const profile = await transactionRunner.run((executor) => repository.upsertProfile(executor, tenantId, input));
      return loadProfileView(profile);
    },

    async createRequest(principal, input) {
      const tenantId = requireTenant(principal);
      validateRoommateRequestContent(input, roommateBusinessDate(now()));
      const eligibleListing = input.listingId === null ? null : await requireEligibleListing(input.listingId);
      let created: RoommateRequestRecord;
      try {
        created = await transactionRunner.run(async (executor) => {
          await repository.lockTenant(executor, tenantId);
          const existing = await repository.findOpenRequestForOwner(executor, tenantId, true);
          if (existing) {
            const current = await expireIfNeeded(executor, existing);
            if (current?.status === "OPEN")
              throw roommateError("ROOMMATE_OPEN_REQUEST_EXISTS", "You already have an open roommate request.");
          }
          await requireComplete(executor, tenantId);
          if (await repository.hasAcceptedConnection(executor, tenantId)) {
            throw roommateError("ROOMMATE_ACTIVE_CONNECTION_EXISTS", "You already have an active roommate connection.");
          }
          return repository.createRequest(executor, tenantId, input);
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
          throw roommateError("ROOMMATE_OPEN_REQUEST_EXISTS", "You already have an open roommate request.");
        }
        throw error;
      }
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const [view] = await decorate(
        [created],
        profile ? new Map([[tenantId, profile]]) : undefined,
        undefined,
        eligibleListing ? new Map([[eligibleListing.id, eligibleListing]]) : undefined
      );
      if (!view) throw new Error("Created roommate request could not be decorated.");
      return view;
    },

    async listDiscovery(principal, query) {
      const callerTenantId = requireTenant(principal);
      const needed = query.offset + query.pageSize + 1;
      const eligible: RoommateRequestView[] = [];
      let scanOffset = 0;
      while (eligible.length < needed) {
        const currentTime = now();
        const candidates = await transactionRunner.run((executor) =>
          repository.listDiscoveryCandidates(executor, {
            callerTenantId,
            now: currentTime,
            area: query.area,
            budgetMinPerPerson: query.budgetMinPerPerson,
            budgetMaxPerPerson: query.budgetMaxPerPerson,
            moveInFrom: query.moveInFrom,
            moveInUntil: query.moveInUntil,
            listingMode: query.listingMode,
            limit: 100,
            offset: scanOffset
          })
        );
        if (candidates.length === 0) break;
        scanOffset += candidates.length;
        const candidatesForRemote = candidates.filter(
          (candidate) =>
            matchesLocalDiscoveryFilters(candidate, query) &&
            candidate.ownerTenantId !== callerTenantId &&
            candidate.status === "OPEN" &&
            candidate.moderationState === "VISIBLE" &&
            profileComplete(candidate.profile) &&
            new Date(candidate.expiresAt).getTime() > currentTime.getTime()
        );
        const identities = await loadIdentity([
          ...new Set(candidatesForRemote.map((candidate) => candidate.ownerTenantId))
        ]);
        const linkedIds = [
          ...new Set(
            candidatesForRemote.flatMap((candidate) => (candidate.listingId === null ? [] : [candidate.listingId]))
          )
        ];
        const listings = await loadListingMap(linkedIds);
        const identityById = new Map(identities.map((identity) => [identity.tenantId, identity] as const));
        const profileById = new Map(
          candidatesForRemote.map((candidate) => [candidate.ownerTenantId, candidate.profile] as const)
        );
        const eligibleCandidates = candidatesForRemote.filter((candidate) => {
          const identity = identityById.get(candidate.ownerTenantId);
          if (!validateProjection(identity ?? null, candidate.ownerTenantId)) return false;
          if (candidate.listingId !== null) {
            const listing = listings.get(candidate.listingId);
            if (!listing) return false;
            if (
              query.area !== null &&
              !listing.areaName
                .normalize("NFC")
                .toLocaleLowerCase("vi-VN")
                .includes(query.area.toLocaleLowerCase("vi-VN"))
            )
              return false;
          }
          return true;
        });
        const views = await decorate(eligibleCandidates, profileById, identities, listings);
        eligible.push(...views);
        if (candidates.length < 100) break;
      }
      const data = eligible.slice(query.offset, query.offset + query.pageSize);
      return Object.freeze({
        data: Object.freeze(data),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: eligible.length > query.offset + query.pageSize
      });
    },

    async listMine(principal, query) {
      const tenantId = requireTenant(principal);
      const records = await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        const open = await repository.findOpenRequestForOwner(executor, tenantId, true);
        if (open) await expireIfNeeded(executor, open);
        return repository.listOwnedRequests(executor, tenantId, query.status, query.pageSize, query.offset);
      });
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const data = await decorate(
        records.slice(0, query.pageSize),
        profile ? new Map([[tenantId, profile]]) : undefined
      );
      return Object.freeze({
        data,
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: records.length > query.pageSize
      });
    },

    async getRequest(principal, requestId) {
      const tenantId = requireTenant(principal);
      const result = await transactionRunner.run(async (executor) => {
        let request = await repository.findRequestById(executor, requestId, true);
        if (!request) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        request = await expireIfNeeded(executor, request);
        if (!request) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const owner = request.ownerTenantId === tenantId;
        if (!owner) {
          if (request.status !== "OPEN" || request.moderationState !== "VISIBLE") {
            throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          }
          const blocked = await repository.isPairBlocked(executor, tenantId, request.ownerTenantId);
          if (blocked) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          const profile = await repository.findProfile(executor, request.ownerTenantId);
          if (!profileComplete(profile)) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        }
        return { request, owner };
      });
      const profile = await transactionRunner.run((executor) =>
        repository.findProfile(executor, result.request.ownerTenantId)
      );
      if (!profile) {
        if (!result.owner) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        return (await decorate([result.request]))[0]!;
      }
      const [view] = await decorate([result.request], new Map([[result.request.ownerTenantId, profile]]));
      if (!view) throw new Error("Roommate request could not be decorated.");
      if (!result.owner && view.profile?.profileCompleted !== true) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      }
      if (!result.owner && view.listingId !== null && !view.listing)
        throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      return view;
    },

    async updateRequest(principal, requestId, input) {
      const tenantId = requireTenant(principal);
      const updated = await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        const current = await prepareOwnerRequest(executor, tenantId, requestId);
        if (current.status === "EXPIRED") throw roommateError("ROOMMATE_REQUEST_EXPIRED", requestExpiredMessage);
        if (current.status !== "OPEN") throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
        const merged: CreateRoommateRequestInput = {
          listingId: current.listingId,
          preferredAreaKeys: input.preferredAreaKeys ?? current.preferredAreaKeys,
          budgetMinPerPerson: input.budgetMinPerPerson ?? current.budgetMinPerPerson,
          budgetMaxPerPerson: input.budgetMaxPerPerson ?? current.budgetMaxPerPerson,
          moveInFrom: input.moveInFrom ?? current.moveInFrom,
          moveInUntil: input.moveInUntil ?? current.moveInUntil,
          note: input.note === undefined ? current.note : input.note
        };
        validateRoommateRequestContent(merged, roommateBusinessDate(now()));
        if (sameContent(current, merged)) return current;
        return repository.updateRequest(executor, requestId, merged);
      });
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const [view] = await decorate([updated], profile ? new Map([[tenantId, profile]]) : undefined);
      if (!view) throw new Error("Updated roommate request could not be decorated.");
      return view;
    },

    async cancelRequest(principal, requestId) {
      const tenantId = requireTenant(principal);
      const cancelled = await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        const current = await prepareOwnerRequest(executor, tenantId, requestId);
        if (current.status === "EXPIRED") throw roommateError("ROOMMATE_REQUEST_EXPIRED", requestExpiredMessage);
        if (current.status !== "OPEN") throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
        const result = await repository.cancelRequest(executor, requestId);
        if (!result) throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
        await repository.rejectPendingInterests(executor, requestId, "REQUEST_CANCELLED");
        return result;
      });
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const [view] = await decorate([cancelled], profile ? new Map([[tenantId, profile]]) : undefined);
      if (!view) throw new Error("Cancelled roommate request could not be decorated.");
      return view;
    },

    async renewRequest(principal, requestId) {
      const tenantId = requireTenant(principal);
      const renewed = await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        let current = await prepareOwnerRequest(executor, tenantId, requestId);
        const currentTime = now();
        if (current.status === "OPEN" && isExpired(current, currentTime)) {
          await repository.materializeExpired(executor, current.id, currentTime);
          current = (await repository.findRequestById(executor, current.id, true)) ?? current;
        }
        if (current.status !== "EXPIRED") throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
        await requireComplete(executor, tenantId);
        if (await repository.hasAcceptedConnection(executor, tenantId)) {
          throw roommateError("ROOMMATE_ACTIVE_CONNECTION_EXISTS", "You already have an active roommate connection.");
        }
        const anotherOpen = await repository.findOpenRequestForOwner(executor, tenantId, true);
        if (anotherOpen && anotherOpen.id !== current.id) {
          const currentAnother = await expireIfNeeded(executor, anotherOpen);
          if (currentAnother?.status === "OPEN") {
            throw roommateError("ROOMMATE_OPEN_REQUEST_EXISTS", "You already have an open roommate request.");
          }
        }
        validateRoommateRequestContent(current, roommateBusinessDate(now()));
        return repository.renewRequest(executor, current.id);
      });
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const [view] = await decorate([renewed], profile ? new Map([[tenantId, profile]]) : undefined);
      if (!view) throw new Error("Renewed roommate request could not be decorated.");
      return view;
    },

    async linkListing(principal, requestId, listingId) {
      const tenantId = requireTenant(principal);
      await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        const current = await prepareOwnerRequest(executor, tenantId, requestId);
        if (current.status === "EXPIRED") throw roommateError("ROOMMATE_REQUEST_EXPIRED", requestExpiredMessage);
        if (current.status !== "OPEN") throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
      });
      const eligibleListing = await requireEligibleListing(listingId);
      const linked = await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        const current = await prepareOwnerRequest(executor, tenantId, requestId);
        if (current.status === "EXPIRED") throw roommateError("ROOMMATE_REQUEST_EXPIRED", requestExpiredMessage);
        if (current.status !== "OPEN") throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
        if (current.listingId === listingId) return current;
        return repository.linkListing(executor, requestId, listingId);
      });
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const [view] = await decorate(
        [linked],
        profile ? new Map([[tenantId, profile]]) : undefined,
        undefined,
        new Map([[eligibleListing.id, eligibleListing]])
      );
      if (!view) throw new Error("Linked roommate request could not be decorated.");
      return view;
    },

    async unlinkListing(principal, requestId) {
      const tenantId = requireTenant(principal);
      const unlinked = await transactionRunner.run(async (executor) => {
        await repository.lockTenant(executor, tenantId);
        const current = await prepareOwnerRequest(executor, tenantId, requestId);
        if (current.status === "EXPIRED") throw roommateError("ROOMMATE_REQUEST_EXPIRED", requestExpiredMessage);
        if (current.status !== "OPEN") throw roommateError("ROOMMATE_REQUEST_NOT_OPEN", requestNotOpenMessage);
        if (current.listingId === null) return current;
        if (current.preferredAreaKeys.length < 1 || current.preferredAreaKeys.length > 5) {
          throw new ApplicationError("VALIDATION_FAILED", "One to five preferred areas are required before unlinking.");
        }
        return repository.unlinkListing(executor, requestId);
      });
      const profile = await transactionRunner.run((executor) => repository.findProfile(executor, tenantId));
      const [view] = await decorate([unlinked], profile ? new Map([[tenantId, profile]]) : undefined);
      if (!view) throw new Error("Unlinked roommate request could not be decorated.");
      return view;
    }
  };
  return Object.freeze(service);
}

export function isRoommateDiscoveryCandidate(value: unknown): value is RoommateDiscoveryCandidate {
  return typeof value === "object" && value !== null && "profile" in value;
}

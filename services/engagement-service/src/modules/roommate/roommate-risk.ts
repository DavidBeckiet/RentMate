import type {
  RoommateRiskConfig,
  roommateRiskRulesVersion,
  roommateRiskSolicitationPatternVersion
} from "../../../../shared/src/runtime/config/env.js";

export type { RoommateRiskConfig } from "../../../../shared/src/runtime/config/env.js";

export const roommateRiskFlagCodes = [
  "REPEATED_MESSAGE_ACROSS_THREADS",
  "RAPID_INTEREST_ACTIVITY",
  "HIGH_MESSAGE_VOLUME",
  "REPEATED_EXTERNAL_CONTACT_SOLICITATION",
  "REPEATED_REPORT_PATTERN",
  "MULTIPLE_CURRENT_BLOCKERS",
  "NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY"
] as const;

export type RoommateRiskFlagCode = (typeof roommateRiskFlagCodes)[number];
export type RoommateRiskPriority = "ELEVATED" | "STANDARD";

export interface RoommateRiskMessageActivity {
  readonly id: number;
  readonly interestId: number;
  readonly counterpartTenantId: number;
  readonly body: string;
  readonly createdAt: string;
}

export interface RoommateRiskInterestActivity {
  readonly id: number;
  readonly createdAt: string;
}

export interface RoommateRiskReportActivity {
  readonly id: number;
  readonly reporterTenantId: number;
  readonly createdAt: string;
}

export interface RoommateRiskBlockActivity {
  readonly blockerTenantId: number;
  readonly createdAt: string;
}

export interface RoommateRiskActivity {
  readonly messages: readonly RoommateRiskMessageActivity[];
  readonly interests: readonly RoommateRiskInterestActivity[];
  readonly reports: readonly RoommateRiskReportActivity[];
  readonly currentBlockers: readonly RoommateRiskBlockActivity[];
}

export interface RoommateRiskEvidenceSummary {
  readonly messageIds?: readonly number[];
  readonly interestIds?: readonly number[];
  readonly reportIds?: readonly number[];
  readonly distinctCounterpartCount?: number;
  readonly distinctReporterCount?: number;
  readonly currentBlockerCount?: number;
  readonly accountCreatedAt?: string;
}

export interface RoommateRiskFlag {
  readonly code: RoommateRiskFlagCode;
  readonly observedCount: number | null;
  readonly windowStartedAt: string | null;
  readonly evidenceSummary: RoommateRiskEvidenceSummary;
}

export interface RoommateRiskSummary {
  readonly rulesVersion: typeof roommateRiskRulesVersion;
  readonly reviewPriority: RoommateRiskPriority;
  readonly partialEvaluation: boolean;
  readonly flags: readonly RoommateRiskFlag[];
  readonly evaluatedAt: string;
}

export interface EvaluateRoommateRiskInput {
  readonly now: Date;
  readonly config: RoommateRiskConfig;
  readonly activity: RoommateRiskActivity;
  readonly accountCreatedAt?: string;
}

const maximumEvidenceIds = 20;

function validDate(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function sortNewest<T extends { readonly id?: number; readonly createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const timeDifference = validDate(right.createdAt) - validDate(left.createdAt);
    if (timeDifference !== 0 && Number.isFinite(timeDifference)) return timeDifference;
    return (right.id ?? 0) - (left.id ?? 0);
  });
}

function evidenceIds(items: readonly { readonly id: number; readonly createdAt: string }[]): readonly number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of sortNewest(items)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ids.push(item.id);
    if (ids.length === maximumEvidenceIds) break;
  }
  return Object.freeze(ids);
}

function windowStart(now: Date, durationMs: number): string {
  return new Date(now.getTime() - durationMs).toISOString();
}

function inWindow(createdAt: string, now: number, durationMs: number): boolean {
  const created = validDate(createdAt);
  return Number.isFinite(created) && created >= now - durationMs && created <= now;
}

export function normalizeRoommateRiskMessage(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").trim().replace(/\s+/gu, " ").toLocaleLowerCase("und");
}

export function hasRoommateSolicitationPattern(
  value: string,
  patternVersion: typeof roommateRiskSolicitationPatternVersion
): boolean {
  if (patternVersion !== "V1") return false;
  const normalized = normalizeRoommateRiskMessage(value);
  return (
    /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+/iu.test(normalized) ||
    /(?:^|[^\p{L}\p{N}])(?:0[35789]\d{8,9}|\+84[35789]\d{8,9})(?:$|[^\p{L}\p{N}])/u.test(normalized) ||
    /\b(?:zalo|s(?:ố|o)\s*(?:điện\s*thoại|dt)|phone|telegram|whatsapp|t(?:ài|ai)\s*khoản|stk|bank)\b[^\d]{0,24}\d{8,16}\b/iu.test(
      normalized
    ) ||
    /(?<![\p{L}\p{N}])(?:chuyển\s*(?:khoản|tiền)|đặt\s*cọc|gửi\s*tiền|nạp\s*tiền|thanh\s*toán)(?![\p{L}\p{N}])/iu.test(
      normalized
    ) ||
    /\b(?:otp|mã\s*(?:otp|xác\s*thực)|verification\s*code)\b/iu.test(normalized)
  );
}

function flag(
  code: RoommateRiskFlagCode,
  observedCount: number | null,
  startedAt: string | null,
  evidenceSummary: RoommateRiskEvidenceSummary
): RoommateRiskFlag {
  return Object.freeze({
    code,
    observedCount,
    windowStartedAt: startedAt,
    evidenceSummary: Object.freeze(evidenceSummary)
  });
}

function repeatedMessageFlag(
  activity: RoommateRiskActivity,
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  const messages = activity.messages.filter((message) =>
    inWindow(message.createdAt, now, config.repeatedMessageWindowMs)
  );
  const groups = new Map<string, RoommateRiskMessageActivity[]>();
  for (const message of messages) {
    const normalized = normalizeRoommateRiskMessage(message.body);
    const group = groups.get(normalized) ?? [];
    group.push(message);
    groups.set(normalized, group);
  }

  const candidates = [...groups.values()]
    .map((group) => ({
      messages: sortNewest(group),
      counterparts: new Set(group.map((message) => message.counterpartTenantId))
    }))
    .filter((candidate) => candidate.counterparts.size >= config.repeatedMessageCounterpartThreshold)
    .sort((left, right) => {
      const counterpartDifference = right.counterparts.size - left.counterparts.size;
      if (counterpartDifference !== 0) return counterpartDifference;
      const leftLatest = validDate(left.messages[0]?.createdAt ?? "");
      const rightLatest = validDate(right.messages[0]?.createdAt ?? "");
      return rightLatest - leftLatest || (right.messages[0]?.id ?? 0) - (left.messages[0]?.id ?? 0);
    });
  const candidate = candidates[0];
  if (!candidate) return null;
  return flag(
    "REPEATED_MESSAGE_ACROSS_THREADS",
    candidate.counterparts.size,
    windowStart(new Date(now), config.repeatedMessageWindowMs),
    {
      messageIds: evidenceIds(candidate.messages),
      interestIds: evidenceIds(
        candidate.messages.map((message) => ({ id: message.interestId, createdAt: message.createdAt }))
      ),
      distinctCounterpartCount: candidate.counterparts.size
    }
  );
}

function rapidInterestFlag(
  activity: RoommateRiskActivity,
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  const interests = activity.interests.filter((interest) =>
    inWindow(interest.createdAt, now, config.rapidInterestWindowMs)
  );
  if (interests.length < config.rapidInterestCountThreshold) return null;
  return flag("RAPID_INTEREST_ACTIVITY", interests.length, windowStart(new Date(now), config.rapidInterestWindowMs), {
    interestIds: evidenceIds(interests)
  });
}

function highMessageVolumeFlag(
  activity: RoommateRiskActivity,
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  const messages = activity.messages.filter((message) => inWindow(message.createdAt, now, config.highMessageWindowMs));
  const interestIds = new Set(messages.map((message) => message.interestId));
  if (messages.length < config.highMessageCountThreshold || interestIds.size < config.highMessageThreadThreshold)
    return null;
  const latestMessageByInterest = new Map<number, RoommateRiskMessageActivity>();
  for (const message of messages) {
    const current = latestMessageByInterest.get(message.interestId);
    if (
      current === undefined ||
      validDate(message.createdAt) > validDate(current.createdAt) ||
      (message.createdAt === current.createdAt && message.id > current.id)
    ) {
      latestMessageByInterest.set(message.interestId, message);
    }
  }
  return flag("HIGH_MESSAGE_VOLUME", messages.length, windowStart(new Date(now), config.highMessageWindowMs), {
    messageIds: evidenceIds(messages),
    interestIds: evidenceIds(
      [...latestMessageByInterest.values()].map((message) => ({ id: message.interestId, createdAt: message.createdAt }))
    )
  });
}

function solicitationFlag(
  activity: RoommateRiskActivity,
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  const messages = activity.messages.filter(
    (message) =>
      inWindow(message.createdAt, now, config.solicitationWindowMs) &&
      hasRoommateSolicitationPattern(message.body, config.solicitationPatternVersion)
  );
  const counterparts = new Set(messages.map((message) => message.counterpartTenantId));
  if (counterparts.size < config.solicitationCounterpartThreshold) return null;
  return flag(
    "REPEATED_EXTERNAL_CONTACT_SOLICITATION",
    counterparts.size,
    windowStart(new Date(now), config.solicitationWindowMs),
    {
      messageIds: evidenceIds(messages),
      interestIds: evidenceIds(messages.map((message) => ({ id: message.interestId, createdAt: message.createdAt }))),
      distinctCounterpartCount: counterparts.size
    }
  );
}

function repeatedReportFlag(
  activity: RoommateRiskActivity,
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  const reports = activity.reports.filter((report) => inWindow(report.createdAt, now, config.reportWindowMs));
  const reporters = new Set(reports.map((report) => report.reporterTenantId));
  if (reports.length < config.reportCountThreshold || reporters.size < config.reporterCountThreshold) return null;
  return flag("REPEATED_REPORT_PATTERN", reports.length, windowStart(new Date(now), config.reportWindowMs), {
    reportIds: evidenceIds(reports),
    distinctReporterCount: reporters.size
  });
}

function multipleCurrentBlockersFlag(
  activity: RoommateRiskActivity,
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  const blockers = activity.currentBlockers.filter((blocker) =>
    inWindow(blocker.createdAt, now, config.currentBlockWindowMs)
  );
  const blockerIds = new Set(blockers.map((blocker) => blocker.blockerTenantId));
  if (blockerIds.size < config.currentBlockerThreshold) return null;
  return flag("MULTIPLE_CURRENT_BLOCKERS", blockerIds.size, windowStart(new Date(now), config.currentBlockWindowMs), {
    currentBlockerCount: blockerIds.size
  });
}

function newAccountFlag(
  accountCreatedAt: string | undefined,
  firstFlags: readonly RoommateRiskFlag[],
  now: number,
  config: RoommateRiskConfig
): RoommateRiskFlag | null {
  if (accountCreatedAt === undefined || firstFlags.length === 0) return null;
  const created = validDate(accountCreatedAt);
  if (!Number.isFinite(created) || created > now || now - created >= config.newAccountWindowMs) return null;
  return flag("NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY", null, null, { accountCreatedAt });
}

function priority(flags: readonly RoommateRiskFlag[], category: string): RoommateRiskPriority {
  if (
    flags.length >= 2 ||
    flags.some((flagValue) => flagValue.code === "REPEATED_REPORT_PATTERN") ||
    ((category === "FRAUD" || category === "PAYMENT_SCAM") &&
      flags.some((flagValue) => flagValue.code === "REPEATED_EXTERNAL_CONTACT_SOLICITATION"))
  ) {
    return "ELEVATED";
  }
  return "STANDARD";
}

export function evaluateRoommateRisk(
  input: EvaluateRoommateRiskInput & { readonly reportCategory?: string }
): RoommateRiskSummary {
  const now = input.now.getTime();
  const category = input.reportCategory ?? "";
  const firstFlags = [
    repeatedMessageFlag(input.activity, now, input.config),
    rapidInterestFlag(input.activity, now, input.config),
    highMessageVolumeFlag(input.activity, now, input.config),
    solicitationFlag(input.activity, now, input.config),
    repeatedReportFlag(input.activity, now, input.config),
    multipleCurrentBlockersFlag(input.activity, now, input.config)
  ].filter((value): value is RoommateRiskFlag => value !== null);
  const accountFlag = newAccountFlag(input.accountCreatedAt, firstFlags, now, input.config);
  const flags = accountFlag === null ? firstFlags : [...firstFlags, accountFlag];
  return Object.freeze({
    rulesVersion: input.config.rulesVersion,
    reviewPriority: priority(flags, category),
    partialEvaluation: input.accountCreatedAt === undefined,
    flags: Object.freeze(flags),
    evaluatedAt: input.now.toISOString()
  });
}

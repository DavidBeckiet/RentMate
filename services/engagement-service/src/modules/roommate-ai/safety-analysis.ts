import { AiProviderError } from "./providers/ai-provider-error.js";

export const roommateAiSafetySignalCodes = [
  "ADVANCE_PAYMENT_REQUEST",
  "OTP_REQUEST",
  "CREDENTIAL_REQUEST",
  "OFF_PLATFORM_REDIRECTION",
  "EXTERNAL_PAYMENT_REQUEST",
  "URGENCY_PRESSURE",
  "SENSITIVE_FINANCIAL_INFO_REQUEST"
] as const;
export const roommateAiSafetyOutcomes = ["NO_WARNING", "CAUTION", "HIGH_CAUTION"] as const;
export type RoommateAiSafetySignalCode = (typeof roommateAiSafetySignalCodes)[number];
export type RoommateAiSafetyOutcome = (typeof roommateAiSafetyOutcomes)[number];

export interface RoommateAiSafetySourceMessage {
  readonly id: number;
  readonly senderTenantId: number;
  readonly body: string;
  readonly createdAt: string;
}
export interface RoommateAiSafetyProviderMessage {
  readonly token: string;
  readonly role: "SENDER" | "COUNTERPART";
  readonly text: string;
}
export interface RoommateAiSafetyProviderSignal {
  readonly code: RoommateAiSafetySignalCode;
  readonly evidenceMessageTokens: readonly string[];
}
export interface RoommateAiSafetyProviderOutput {
  readonly signals: readonly RoommateAiSafetyProviderSignal[];
}

export const roommateAiSafetyJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["signals"],
  properties: {
    signals: {
      type: "array",
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "evidenceMessageTokens"],
        properties: {
          code: { type: "string", enum: [...roommateAiSafetySignalCodes] },
          evidenceMessageTokens: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", pattern: "^M[0-5]$" }
          }
        }
      }
    }
  }
});

function invalid(): never {
  throw new AiProviderError("SCHEMA_INVALID", "AI_OUTPUT_INVALID");
}
function codePoints(value: string): string[] {
  return Array.from(value);
}
function trimToCodePoints(value: string, maximum: number): string {
  return codePoints(value).slice(0, maximum).join("");
}

const roommateAiSafetyCurrentMessageMaximumCodePoints = 2_000;
const roommateAiSafetyContextMaximumCodePoints = 6_000;

const redactions: readonly [RegExp, string][] = [
  [/\bhttps?:\/\/[^\s<>]+/giu, "<URL>"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "<EMAIL>"],
  [/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/gu, "<PHONE>"],
  [/(?:otp|m[aã] x[aá]c th[ựu]c|verification code|login code)\s*[:#-]?\s*\d{4,8}\b/giu, "<OTP>"],
  [/(?:t[aà]i kho[aả]n|account(?: number)?|s[oố] t[aà]i kho[aả]n)\s*[:#-]?\s*\d(?:[\s.-]?\d){7,23}\b/giu, "<ACCOUNT>"],
  [/(?:api[_ -]?key|access[_ -]?token|secret|password|m[aậ]t kh[aẩ]u)\s*[:=]\s*[^\s<>]{4,}/giu, "<SECRET>"]
];

export function redactRoommateAiSafetyText(value: string): string {
  return redactions.reduce(
    (current, [pattern, placeholder]) => current.replace(pattern, placeholder),
    value.normalize("NFC")
  );
}

export function hasRoommateAiSafetyPrefilterSignal(value: string): boolean {
  return /\b(otp|m[aã] x[aá]c th[ựu]c|password|m[aậ]t kh[aẩ]u|zalo|messenger|telegram|whatsapp|chuy[eê]n kho[aả]n|transfer|pay now|ngay b[aâ]y gi[oờ]|g[aấ]p|account|t[aà]i kho[aả]n)\b/iu.test(
    value
  );
}

export function buildRoommateAiSafetyContext(input: {
  readonly target: RoommateAiSafetySourceMessage;
  readonly previous: readonly RoommateAiSafetySourceMessage[];
}): readonly RoommateAiSafetyProviderMessage[] {
  const previousLimit = hasRoommateAiSafetyPrefilterSignal(input.target.body) ? 5 : 1;
  const selectedPrevious = input.previous.slice(-previousLimit);
  const source = [...selectedPrevious, input.target];
  const targetText = trimToCodePoints(
    redactRoommateAiSafetyText(input.target.body),
    roommateAiSafetyCurrentMessageMaximumCodePoints
  );
  let remaining = roommateAiSafetyContextMaximumCodePoints - codePoints(targetText).length;
  const rendered = source.map((message, index) => ({
    ...message,
    text: index === source.length - 1 ? targetText : redactRoommateAiSafetyText(message.body)
  }));
  for (let index = rendered.length - 2; index >= 0; index -= 1) {
    const text = rendered[index]!.text;
    if (codePoints(text).length <= remaining) {
      remaining -= codePoints(text).length;
      continue;
    }
    rendered[index] = { ...rendered[index]!, text: trimToCodePoints(text, Math.max(0, remaining)) };
    remaining = 0;
  }
  return Object.freeze(
    rendered.map((message, index) =>
      Object.freeze({
        token: `M${index}`,
        role: message.senderTenantId === input.target.senderTenantId ? ("SENDER" as const) : ("COUNTERPART" as const),
        text: message.text
      })
    )
  );
}

export function validateRoommateAiSafetyOutput(
  value: unknown,
  messages: readonly RoommateAiSafetyProviderMessage[]
): RoommateAiSafetyProviderOutput {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const root = value as Record<string, unknown>;
    if (Object.keys(root).length !== 1 || !Array.isArray(root.signals) || root.signals.length > 7) invalid();
    const validTokens = new Set(messages.map((message) => message.token));
    const seenCodes = new Set<string>();
    const signals = root.signals.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid();
      const signal = entry as Record<string, unknown>;
      if (
        Object.keys(signal).length !== 2 ||
        !roommateAiSafetySignalCodes.includes(signal.code as RoommateAiSafetySignalCode) ||
        !Array.isArray(signal.evidenceMessageTokens) ||
        signal.evidenceMessageTokens.length < 1 ||
        signal.evidenceMessageTokens.length > 6
      )
        invalid();
      const code = signal.code as RoommateAiSafetySignalCode;
      if (seenCodes.has(code)) invalid();
      seenCodes.add(code);
      const tokens = signal.evidenceMessageTokens.map((token) => {
        if (typeof token !== "string" || !validTokens.has(token)) invalid();
        return token;
      });
      if (new Set(tokens).size !== tokens.length) invalid();
      return Object.freeze({ code, evidenceMessageTokens: Object.freeze(tokens) });
    });
    return Object.freeze({ signals: Object.freeze(signals) });
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    return invalid();
  }
}

export function deriveRoommateAiSafetyOutcome(signals: readonly RoommateAiSafetySignalCode[]): RoommateAiSafetyOutcome {
  const present = new Set(signals);
  if (
    present.has("OTP_REQUEST") ||
    present.has("CREDENTIAL_REQUEST") ||
    present.has("SENSITIVE_FINANCIAL_INFO_REQUEST")
  )
    return "HIGH_CAUTION";
  const payment = present.has("ADVANCE_PAYMENT_REQUEST") || present.has("EXTERNAL_PAYMENT_REQUEST");
  if (payment && (present.has("URGENCY_PRESSURE") || present.has("OFF_PLATFORM_REDIRECTION"))) return "HIGH_CAUTION";
  return present.size === 0 ? "NO_WARNING" : "CAUTION";
}

import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";

export interface RateLimitPolicy {
  readonly scope: string;
  readonly limit: number;
  readonly windowMs: number;
}

export type Clock = () => number;
export type RateLimitKeyResolver = (request: Request) => string | Promise<string>;

export interface RateLimitConsumeInput {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly now: number;
}

export interface RateLimitConsumeResult {
  readonly allowed: boolean;
}

export interface RateLimitStore {
  consume(input: RateLimitConsumeInput): RateLimitConsumeResult | Promise<RateLimitConsumeResult>;
}

interface RateLimitBucket {
  count: number;
  readonly resetAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  get entryCount(): number {
    return this.buckets.size;
  }

  consume(input: RateLimitConsumeInput): RateLimitConsumeResult {
    if (!Number.isFinite(input.now) || input.now < 0 || input.now > Number.MAX_SAFE_INTEGER - input.windowMs) {
      throw new Error("Rate-limit clock returned an invalid value.");
    }

    this.removeExpiredEntries(input.now);
    const bucket = this.buckets.get(input.key);

    if (!bucket) {
      this.buckets.set(input.key, {
        count: 1,
        resetAt: input.now + input.windowMs
      });
      return Object.freeze({ allowed: true });
    }

    if (bucket.count >= input.limit) {
      return Object.freeze({ allowed: false });
    }

    bucket.count += 1;
    return Object.freeze({ allowed: true });
  }

  private removeExpiredEntries(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}

export interface RateLimitMiddlewareOptions {
  readonly policy: RateLimitPolicy;
  readonly resolveKey: RateLimitKeyResolver;
  readonly store?: RateLimitStore;
  readonly clock?: Clock;
}

export const rateLimitedMessage = "Too many requests. Please try again later.";

function validatePolicy(policy: RateLimitPolicy): RateLimitPolicy {
  if (policy.scope.trim().length === 0) {
    throw new Error("Rate-limit scope must not be blank.");
  }

  if (!Number.isSafeInteger(policy.limit) || policy.limit <= 0) {
    throw new Error("Rate-limit limit must be a positive safe integer.");
  }

  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs <= 0) {
    throw new Error("Rate-limit windowMs must be a positive safe integer.");
  }

  return Object.freeze({ ...policy });
}

function createScopedKey(scope: string, resolvedKey: string): string {
  return JSON.stringify([scope, resolvedKey]);
}

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions): RequestHandler {
  const policy = validatePolicy(options.policy);
  const store = options.store ?? new InMemoryRateLimitStore();
  const clock = options.clock ?? Date.now;

  return (request, _response, next): void => {
    void Promise.resolve()
      .then(async () => {
        const resolvedKey = await options.resolveKey(request);
        if (typeof resolvedKey !== "string" || resolvedKey.trim().length === 0) {
          throw new Error("Rate-limit key resolver returned a blank key.");
        }

        const result = await store.consume({
          key: createScopedKey(policy.scope, resolvedKey),
          limit: policy.limit,
          windowMs: policy.windowMs,
          now: clock()
        });

        if (!result.allowed) {
          throw new ApplicationError("RATE_LIMITED", rateLimitedMessage);
        }
      })
      .then(() => next())
      .catch(next);
  };
}

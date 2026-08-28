import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { TransactionRunner } from "../../../shared/transaction.js";
import type {
  ContactVerificationChannel,
  ContactVerificationRepository,
  ContactVerificationStatus
} from "../repositories/contact-verification-repository.js";
import type { LandlordVerification, VerificationRepository } from "../repositories/verification-repository.js";
import type {
  ConfirmEmailVerificationInput,
  ConfirmPhoneVerificationInput
} from "../validations/verification-validation.js";
import type {
  ContactVerificationDelivery,
  ContactVerificationDeliveryInput
} from "../contact-verification-delivery.js";

const emailChallengeLifetimeMs = 30 * 60 * 1_000;
const phoneChallengeLifetimeMs = 5 * 60 * 1_000;
const maximumChallengeAttempts = 5;
const invalidChallengeMessage = "Mã xác minh không hợp lệ hoặc đã hết hạn.";

export interface ContactVerificationStatusResult {
  readonly email: {
    readonly address: string;
    readonly verifiedAt: string | null;
    readonly available: boolean;
  };
  readonly phone: {
    readonly number: string | null;
    readonly verifiedAt: string | null;
    readonly available: boolean;
  };
  readonly profile: LandlordVerification | null;
}

export interface ContactVerificationService {
  readonly status: (principal: AuthenticatedPrincipal) => Promise<ContactVerificationStatusResult>;
  readonly requestEmail: (principal: AuthenticatedPrincipal) => Promise<ContactVerificationStatusResult>;
  readonly confirmEmail: (
    principal: AuthenticatedPrincipal,
    input: ConfirmEmailVerificationInput
  ) => Promise<ContactVerificationStatusResult>;
  readonly requestPhone: (principal: AuthenticatedPrincipal) => Promise<ContactVerificationStatusResult>;
  readonly confirmPhone: (
    principal: AuthenticatedPrincipal,
    input: ConfirmPhoneVerificationInput
  ) => Promise<ContactVerificationStatusResult>;
  readonly tenantStatus: (principal: AuthenticatedPrincipal) => Promise<ContactVerificationStatusResult>;
  readonly requestTenantEmail: (principal: AuthenticatedPrincipal) => Promise<ContactVerificationStatusResult>;
  readonly confirmTenantEmail: (
    principal: AuthenticatedPrincipal,
    input: ConfirmEmailVerificationInput
  ) => Promise<ContactVerificationStatusResult>;
  readonly requestTenantPhone: (principal: AuthenticatedPrincipal) => Promise<ContactVerificationStatusResult>;
  readonly confirmTenantPhone: (
    principal: AuthenticatedPrincipal,
    input: ConfirmPhoneVerificationInput
  ) => Promise<ContactVerificationStatusResult>;
}

function requireLandlord(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "LANDLORD") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function requireTenant(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "TENANT") throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function statusResult(
  contact: ContactVerificationStatus,
  profile: LandlordVerification | null,
  delivery: ContactVerificationDelivery
): ContactVerificationStatusResult {
  return Object.freeze({
    email: Object.freeze({
      address: contact.email,
      verifiedAt: contact.emailVerifiedAt,
      available: delivery.isAvailable("EMAIL")
    }),
    phone: Object.freeze({
      number: contact.phone,
      verifiedAt: contact.phoneVerifiedAt,
      available: delivery.isAvailable("PHONE")
    }),
    profile
  });
}

function invalidChallenge(): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", invalidChallengeMessage);
}

function hashSecret(pepper: string, secret: string): string {
  return createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
}

function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createEmailToken(): string {
  return randomBytes(32).toString("base64url");
}

function createPhoneCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function createContactVerificationService(dependencies: {
  readonly contactRepository: ContactVerificationRepository;
  readonly verificationRepository: VerificationRepository;
  readonly transactionRunner: TransactionRunner;
  readonly delivery: ContactVerificationDelivery;
  readonly secretPepper: string;
  readonly now?: () => Date;
  readonly createEmailToken?: () => string;
  readonly createPhoneCode?: () => string;
}): ContactVerificationService {
  const now = dependencies.now ?? (() => new Date());
  const createEmailTokenValue = dependencies.createEmailToken ?? createEmailToken;
  const createPhoneCodeValue = dependencies.createPhoneCode ?? createPhoneCode;

  async function loadStatus(userId: number, includeLandlordProfile: boolean): Promise<ContactVerificationStatusResult> {
    return dependencies.transactionRunner(async (executor) => {
      const contact = await dependencies.contactRepository.findStatus(executor, userId);
      if (contact === null) throw new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required.");
      const profile = includeLandlordProfile
        ? await dependencies.verificationRepository.findLatestForLandlord(executor, userId)
        : null;
      return statusResult(contact, profile, dependencies.delivery);
    });
  }

  async function request(
    channel: ContactVerificationChannel,
    userId: number,
    includeLandlordProfile: boolean
  ): Promise<ContactVerificationStatusResult> {
    const secret = channel === "EMAIL" ? createEmailTokenValue() : createPhoneCodeValue();
    const expiresAt = new Date(
      now().getTime() + (channel === "EMAIL" ? emailChallengeLifetimeMs : phoneChallengeLifetimeMs)
    );
    let deliveryInput: ContactVerificationDeliveryInput | null = null;

    await dependencies.transactionRunner(async (executor) => {
      const contact = await dependencies.contactRepository.findStatus(executor, userId, { forUpdate: true });
      if (contact === null) throw new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required.");

      if (channel === "EMAIL") {
        if (contact.emailVerifiedAt !== null) return;
        if (!dependencies.delivery.isAvailable(channel)) {
          throw new ApplicationError("PROVIDER_UNAVAILABLE", "Verification delivery is temporarily unavailable.");
        }
        deliveryInput = { channel, destination: contact.email, secret };
      } else {
        if (contact.phone === null) {
          throw new ApplicationError("VALIDATION_FAILED", "A phone number is required before verification.");
        }
        if (contact.phoneVerifiedAt !== null) return;
        if (!dependencies.delivery.isAvailable(channel)) {
          throw new ApplicationError("PROVIDER_UNAVAILABLE", "Verification delivery is temporarily unavailable.");
        }
        deliveryInput = { channel, destination: contact.phone, secret };
      }

      await dependencies.contactRepository.createChallenge(executor, {
        userId,
        channel,
        destination: deliveryInput.destination,
        secretHash: hashSecret(dependencies.secretPepper, secret),
        expiresAt
      });
    });

    if (deliveryInput !== null) {
      try {
        await dependencies.delivery.deliver(deliveryInput);
      } catch (error) {
        throw new ApplicationError("PROVIDER_UNAVAILABLE", "Verification delivery is temporarily unavailable.", {
          cause: error
        });
      }
    }

    return loadStatus(userId, includeLandlordProfile);
  }

  async function confirm(
    channel: ContactVerificationChannel,
    secret: string,
    userId: number,
    includeLandlordProfile: boolean
  ): Promise<ContactVerificationStatusResult> {
    await dependencies.transactionRunner(async (executor) => {
      const contact = await dependencies.contactRepository.findStatus(executor, userId, { forUpdate: true });
      if (contact === null) throw new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required.");
      if (channel === "EMAIL" && contact.emailVerifiedAt !== null) return;
      if (channel === "PHONE" && contact.phoneVerifiedAt !== null) return;

      const challenge = await dependencies.contactRepository.findChallengeForUpdate(executor, { userId, channel });
      const currentDestination = channel === "EMAIL" ? contact.email : contact.phone;
      const secretHash = hashSecret(dependencies.secretPepper, secret);
      const expired = challenge === null || new Date(challenge.expiresAt).getTime() <= now().getTime();
      const destinationChanged = challenge !== null && challenge.destination !== currentDestination;
      const secretMatches = challenge !== null && secretsEqual(challenge.secretHash, secretHash);

      if (
        challenge === null ||
        expired ||
        destinationChanged ||
        !secretMatches ||
        challenge.attemptCount >= maximumChallengeAttempts
      ) {
        if (challenge !== null && !expired && challenge.attemptCount < maximumChallengeAttempts) {
          await dependencies.contactRepository.incrementAttempts(executor, challenge.id);
        }
        throw invalidChallenge();
      }

      await dependencies.contactRepository.consumeChallenge(executor, challenge.id);
      await dependencies.contactRepository.markVerified(executor, userId, channel);
    });

    return loadStatus(userId, includeLandlordProfile);
  }

  const service: ContactVerificationService = {
    status(principal) {
      return loadStatus(requireLandlord(principal), true);
    },
    requestEmail(principal) {
      return request("EMAIL", requireLandlord(principal), true);
    },
    confirmEmail(principal, input) {
      return confirm("EMAIL", input.token, requireLandlord(principal), true);
    },
    requestPhone(principal) {
      return request("PHONE", requireLandlord(principal), true);
    },
    confirmPhone(principal, input) {
      return confirm("PHONE", input.code, requireLandlord(principal), true);
    },
    tenantStatus(principal) {
      return loadStatus(requireTenant(principal), false);
    },
    requestTenantEmail(principal) {
      return request("EMAIL", requireTenant(principal), false);
    },
    confirmTenantEmail(principal, input) {
      return confirm("EMAIL", input.token, requireTenant(principal), false);
    },
    requestTenantPhone(principal) {
      return request("PHONE", requireTenant(principal), false);
    },
    confirmTenantPhone(principal, input) {
      return confirm("PHONE", input.code, requireTenant(principal), false);
    }
  };
  return Object.freeze(service);
}

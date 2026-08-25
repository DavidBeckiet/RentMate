import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { ContactVerificationDeliveryInput } from "../src/modules/verifications/contact-verification-delivery.js";
import { createContactVerificationService } from "../src/modules/verifications/services/contact-verification-service.js";
import type {
  ContactVerificationChallenge,
  ContactVerificationRepository,
  ContactVerificationStatus
} from "../src/modules/verifications/repositories/contact-verification-repository.js";
import type { VerificationRepository } from "../src/modules/verifications/repositories/verification-repository.js";

const executor = {} as SqlExecutor;
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 7, role: "LANDLORD" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 8, role: "TENANT" });
const now = new Date("2026-08-25T00:00:00.000Z");

function harness(options: { readonly phone?: string | null; readonly deliveryFails?: boolean } = {}) {
  let contact: ContactVerificationStatus = Object.freeze({
    email: "owner@example.com",
    phone: options.phone === undefined ? "+84901234567" : options.phone,
    emailVerifiedAt: null,
    phoneVerifiedAt: null
  });
  let nextId = 1;
  const challenges = new Map<number, ContactVerificationChallenge & { consumed: boolean }>();
  const deliveries: ContactVerificationDeliveryInput[] = [];
  const contactRepository: ContactVerificationRepository = {
    async findStatus() {
      return contact;
    },
    async createChallenge(_executor, input) {
      const challenge = Object.freeze({
        id: nextId++,
        userId: input.userId,
        channel: input.channel,
        destination: input.destination,
        secretHash: input.secretHash,
        attemptCount: 0,
        expiresAt: input.expiresAt.toISOString(),
        consumed: false
      });
      challenges.set(challenge.id, challenge);
      return challenge;
    },
    async findChallengeForUpdate(_executor, input) {
      return (
        [...challenges.values()]
          .reverse()
          .find(
            (challenge) =>
              !challenge.consumed && challenge.userId === input.userId && challenge.channel === input.channel
          ) ?? null
      );
    },
    async incrementAttempts(_executor, challengeId) {
      const challenge = challenges.get(challengeId);
      if (!challenge || challenge.consumed) return null;
      const next = {
        ...challenge,
        attemptCount: challenge.attemptCount + 1,
        consumed: challenge.attemptCount + 1 >= 5
      };
      challenges.set(challengeId, next);
      return next.attemptCount;
    },
    async consumeChallenge(_executor, challengeId) {
      const challenge = challenges.get(challengeId);
      if (challenge) challenges.set(challengeId, { ...challenge, consumed: true });
    },
    async markVerified(_executor, _userId, channel) {
      contact = Object.freeze({
        ...contact,
        ...(channel === "EMAIL" ? { emailVerifiedAt: now.toISOString() } : { phoneVerifiedAt: now.toISOString() })
      });
    }
  };
  const verificationRepository = {
    async findLatestForLandlord() {
      return null;
    }
  } as Pick<VerificationRepository, "findLatestForLandlord"> as VerificationRepository;
  const delivery = {
    async deliver(input: ContactVerificationDeliveryInput) {
      if (options.deliveryFails) throw new Error("provider unavailable");
      deliveries.push(input);
    }
  };
  const service = createContactVerificationService({
    contactRepository,
    verificationRepository,
    transactionRunner: (operation) => operation(executor),
    delivery,
    secretPepper: "test-pepper",
    now: () => now,
    createEmailToken: () => "email-token",
    createPhoneCode: () => "123456"
  });
  return {
    service,
    deliveries,
    get contact() {
      return contact;
    }
  };
}

test("requests and confirms email verification without storing the raw token", async () => {
  const subject = harness();
  const requested = await subject.service.requestEmail(landlord);
  assert.equal(requested.email.verifiedAt, null);
  assert.deepEqual(subject.deliveries[0], {
    channel: "EMAIL",
    destination: "owner@example.com",
    secret: "email-token"
  });

  const confirmed = await subject.service.confirmEmail(landlord, { token: "email-token" });
  assert.notEqual(confirmed.email.verifiedAt, null);
  assert.equal(subject.contact.emailVerifiedAt, confirmed.email.verifiedAt);
});

test("counts invalid phone codes and confirms the current phone number", async () => {
  const subject = harness();
  await subject.service.requestPhone(landlord);
  await assert.rejects(() => subject.service.confirmPhone(landlord, { code: "000000" }), /không hợp lệ/i);
  const confirmed = await subject.service.confirmPhone(landlord, { code: "123456" });
  assert.notEqual(confirmed.phone.verifiedAt, null);
});

test("rejects non-landlords, missing phones, and delivery failures safely", async () => {
  assert.throws(() => harness().service.status(tenant), /permission/i);
  await assert.rejects(() => harness({ phone: null }).service.requestPhone(landlord), /phone number is required/i);
  await assert.rejects(() => harness({ deliveryFails: true }).service.requestEmail(landlord), {
    code: "PROVIDER_UNAVAILABLE"
  });
});

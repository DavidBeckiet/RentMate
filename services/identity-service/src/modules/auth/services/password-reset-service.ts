import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { TransactionRunner } from "../../../shared/transaction.js";
import type { PasswordService } from "../password.js";
import type { LoginAuthRepository } from "../repositories/auth-repository.js";
import type { PasswordResetRepository } from "../repositories/password-reset-repository.js";
import type { PasswordResetDelivery } from "../password-reset-delivery.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import type {
  PasswordResetConfirmationInput,
  PasswordResetRequestInput
} from "../validations/password-reset-validation.js";

const passwordResetLifetimeMs = 30 * 60 * 1_000;
const invalidPasswordResetMessage = "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.";

export interface PasswordResetService {
  readonly request: (input: PasswordResetRequestInput) => Promise<void>;
  readonly confirm: (input: PasswordResetConfirmationInput) => Promise<void>;
}

function hashCode(secretPepper: string, userId: number, expiresAt: Date, code: string): string {
  return createHmac("sha256", secretPepper)
    .update(`${userId}:${expiresAt.toISOString()}:${code}`, "utf8")
    .digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function invalidPasswordReset(): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", invalidPasswordResetMessage);
}

function createCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function createPasswordResetService(dependencies: {
  readonly authRepository: LoginAuthRepository;
  readonly passwordResetRepository: PasswordResetRepository;
  readonly passwordService: PasswordService;
  readonly transactionRunner: TransactionRunner;
  readonly delivery: PasswordResetDelivery;
  readonly secretPepper: string;
  readonly now?: () => Date;
  readonly createCode?: () => string;
  readonly logger?: Pick<Logger, "warn">;
}): PasswordResetService {
  const now = dependencies.now ?? (() => new Date());
  const createCodeValue = dependencies.createCode ?? createCode;

  const service: PasswordResetService = {
    async request(input) {
      const account = await dependencies.authRepository.findLoginAccount(input.email);
      if (!account || !account.isActive) return;

      const code = createCodeValue();
      const expiresAt = new Date(now().getTime() + passwordResetLifetimeMs);
      const tokenHash = hashCode(dependencies.secretPepper, account.id, expiresAt, code);
      await dependencies.transactionRunner(async (executor) => {
        await dependencies.passwordResetRepository.invalidateActiveTokens(executor, account.id);
        await dependencies.passwordResetRepository.createToken(executor, {
          userId: account.id,
          tokenHash,
          expiresAt
        });
      });

      try {
        await dependencies.delivery.deliver({
          destination: account.email,
          secret: code
        });
      } catch (error) {
        dependencies.logger?.warn("Password reset delivery failed", {
          userId: account.id,
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
      }
    },

    async confirm(input) {
      const account = await dependencies.authRepository.findLoginAccount(input.email);
      if (!account || !account.isActive) throw invalidPasswordReset();
      const currentTime = now();
      await dependencies.transactionRunner(async (executor) => {
        const token = await dependencies.passwordResetRepository.findActiveTokenForUserForUpdate(executor, account.id);
        if (!token || token.expiresAt.getTime() <= currentTime.getTime()) throw invalidPasswordReset();
        const submittedHash = hashCode(dependencies.secretPepper, account.id, token.expiresAt, input.code);
        if (!hashesEqual(token.tokenHash, submittedHash)) throw invalidPasswordReset();

        const passwordHash = await dependencies.passwordService.hashPassword(input.password);
        const updated = await dependencies.passwordResetRepository.updatePasswordHash(
          executor,
          token.userId,
          passwordHash
        );
        if (!updated || !(await dependencies.passwordResetRepository.consumeToken(executor, token.id))) {
          throw invalidPasswordReset();
        }
      });
    }
  };
  return Object.freeze(service);
}

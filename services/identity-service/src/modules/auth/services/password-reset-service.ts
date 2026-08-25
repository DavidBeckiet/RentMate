import { createHmac, randomBytes } from "node:crypto";
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
const invalidPasswordResetMessage = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.";

export interface PasswordResetService {
  readonly request: (input: PasswordResetRequestInput) => Promise<void>;
  readonly confirm: (input: PasswordResetConfirmationInput) => Promise<void>;
}

function hashToken(secretPepper: string, token: string): string {
  return createHmac("sha256", secretPepper).update(token, "utf8").digest("hex");
}

function invalidPasswordReset(): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", invalidPasswordResetMessage);
}

function createToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createPasswordResetService(dependencies: {
  readonly authRepository: LoginAuthRepository;
  readonly passwordResetRepository: PasswordResetRepository;
  readonly passwordService: PasswordService;
  readonly transactionRunner: TransactionRunner;
  readonly delivery: PasswordResetDelivery;
  readonly secretPepper: string;
  readonly frontendOrigin: string;
  readonly now?: () => Date;
  readonly createToken?: () => string;
  readonly logger?: Pick<Logger, "warn">;
}): PasswordResetService {
  const now = dependencies.now ?? (() => new Date());
  const createTokenValue = dependencies.createToken ?? createToken;

  const service: PasswordResetService = {
    async request(input) {
      const account = await dependencies.authRepository.findLoginAccount(input.email);
      if (!account || !account.isActive) return;

      const token = createTokenValue();
      const expiresAt = new Date(now().getTime() + passwordResetLifetimeMs);
      const tokenHash = hashToken(dependencies.secretPepper, token);
      await dependencies.transactionRunner(async (executor) => {
        await dependencies.passwordResetRepository.invalidateActiveTokens(executor, account.id);
        await dependencies.passwordResetRepository.createToken(executor, {
          userId: account.id,
          tokenHash,
          expiresAt
        });
      });

      const resetUrl = new URL("/reset-password", dependencies.frontendOrigin);
      resetUrl.searchParams.set("token", token);
      try {
        await dependencies.delivery.deliver({
          destination: account.email,
          secret: token,
          resetUrl: resetUrl.toString()
        });
      } catch (error) {
        dependencies.logger?.warn("Password reset delivery failed", {
          userId: account.id,
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
      }
    },

    async confirm(input) {
      const tokenHash = hashToken(dependencies.secretPepper, input.token);
      const currentTime = now();
      await dependencies.transactionRunner(async (executor) => {
        const token = await dependencies.passwordResetRepository.findTokenForUpdate(executor, tokenHash);
        if (!token || token.expiresAt.getTime() <= currentTime.getTime()) throw invalidPasswordReset();

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

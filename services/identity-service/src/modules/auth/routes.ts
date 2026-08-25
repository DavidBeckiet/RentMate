import type { Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import {
  createLoginHandler,
  createLogoutHandler,
  type LoginControllerDependencies
} from "./controllers/login-controller.js";
import {
  createPasswordResetConfirmationHandler,
  createPasswordResetRequestHandler
} from "./controllers/password-reset-controller.js";
import {
  createRegistrationHandler,
  type RegistrationControllerDependencies
} from "./controllers/registration-controller.js";
import type { PasswordResetService } from "./services/password-reset-service.js";

export const registrationRateLimitPolicy = Object.freeze({
  scope: "auth:registration",
  limit: 5,
  windowMs: 15 * 60 * 1000
});

export const loginRateLimitPolicy = Object.freeze({
  scope: "auth:login",
  limit: 5,
  windowMs: 15 * 60 * 1000
});

export const passwordResetRequestRateLimitPolicy = Object.freeze({
  scope: "auth:password-reset-request",
  limit: 5,
  windowMs: 15 * 60 * 1000
});

export const passwordResetConfirmRateLimitPolicy = Object.freeze({
  scope: "auth:password-reset-confirm",
  limit: 10,
  windowMs: 15 * 60 * 1000
});

export interface AuthRouteDependencies extends RegistrationControllerDependencies, LoginControllerDependencies {
  readonly passwordResetService: PasswordResetService;
  readonly registrationRateLimitStore?: RateLimitStore;
  readonly registrationRateLimitClock?: Clock;
  readonly loginRateLimitStore?: RateLimitStore;
  readonly loginRateLimitClock?: Clock;
  readonly passwordResetRateLimitStore?: RateLimitStore;
  readonly passwordResetRateLimitClock?: Clock;
}

export function registerAuthRoutes(router: Router, dependencies: AuthRouteDependencies): void {
  const sharedRateLimitStore = dependencies.registrationRateLimitStore ?? new InMemoryRateLimitStore();
  const registrationRateLimiter = createRateLimitMiddleware({
    policy: registrationRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: sharedRateLimitStore,
    clock: dependencies.registrationRateLimitClock
  });
  const loginRateLimiter = createRateLimitMiddleware({
    policy: loginRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: dependencies.loginRateLimitStore ?? sharedRateLimitStore,
    clock: dependencies.loginRateLimitClock
  });
  const passwordResetRateLimitStore = dependencies.passwordResetRateLimitStore ?? new InMemoryRateLimitStore();
  const passwordResetRequestRateLimiter = createRateLimitMiddleware({
    policy: passwordResetRequestRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: passwordResetRateLimitStore,
    clock: dependencies.passwordResetRateLimitClock
  });
  const passwordResetConfirmRateLimiter = createRateLimitMiddleware({
    policy: passwordResetConfirmRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: passwordResetRateLimitStore,
    clock: dependencies.passwordResetRateLimitClock
  });

  router.post("/auth/register/tenant", registrationRateLimiter, createRegistrationHandler("TENANT", dependencies));
  router.post("/auth/register/landlord", registrationRateLimiter, createRegistrationHandler("LANDLORD", dependencies));
  router.post("/auth/login", loginRateLimiter, createLoginHandler(dependencies));
  router.post("/auth/logout", createLogoutHandler(dependencies));
  router.post(
    "/auth/password-reset/request",
    passwordResetRequestRateLimiter,
    createPasswordResetRequestHandler(dependencies.passwordResetService)
  );
  router.post(
    "/auth/password-reset/confirm",
    passwordResetConfirmRateLimiter,
    createPasswordResetConfirmationHandler(dependencies.passwordResetService)
  );
}

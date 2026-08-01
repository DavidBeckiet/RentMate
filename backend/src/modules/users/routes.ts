import type { RequestHandler, Router } from "express";
import { createGetCurrentUserHandler, createPatchCurrentUserHandler } from "./users-controller.js";
import type { UsersService } from "./users-service.js";

export interface UsersRouteDependencies {
  readonly authenticationMiddleware: RequestHandler;
  readonly usersService: UsersService;
}

export function registerUsersRoutes(router: Router, dependencies: UsersRouteDependencies): void {
  router.get(
    "/users/me",
    dependencies.authenticationMiddleware,
    createGetCurrentUserHandler(dependencies.usersService)
  );
  router.patch(
    "/users/me",
    dependencies.authenticationMiddleware,
    createPatchCurrentUserHandler(dependencies.usersService)
  );
}

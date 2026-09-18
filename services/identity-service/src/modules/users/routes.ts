import type { RequestHandler, Router } from "express";
import {
  createGetAdminUserHandler,
  createListAdminUsersHandler,
  createSetAdminUserActivationHandler
} from "./controllers/admin-user-controller.js";
import type { AdminUserService } from "./services/admin-user-service.js";
import { createGetCurrentUserHandler, createPatchCurrentUserHandler } from "./controllers/users-controller.js";
import type { UsersService } from "./services/users-service.js";

export interface UsersRouteDependencies {
  readonly authenticationMiddleware: RequestHandler;
  readonly adminRoleMiddleware?: RequestHandler;
  readonly adminUserService?: AdminUserService;
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
  if (dependencies.adminRoleMiddleware && dependencies.adminUserService) {
    router.get(
      "/admin/users",
      dependencies.authenticationMiddleware,
      dependencies.adminRoleMiddleware,
      createListAdminUsersHandler(dependencies.adminUserService)
    );
    router.get(
      "/admin/users/:userId",
      dependencies.authenticationMiddleware,
      dependencies.adminRoleMiddleware,
      createGetAdminUserHandler(dependencies.adminUserService)
    );
    router.patch(
      "/admin/users/:userId/activation",
      dependencies.authenticationMiddleware,
      dependencies.adminRoleMiddleware,
      createSetAdminUserActivationHandler(dependencies.adminUserService)
    );
  }
}

import type { RequestHandler, Router } from "express";
import { createListAdminUsersHandler, createSetAdminUserActivationHandler } from "./admin-user-controller.js";
import type { AdminUserService } from "./admin-user-service.js";
import { createGetCurrentUserHandler, createPatchCurrentUserHandler } from "./users-controller.js";
import type { UsersService } from "./users-service.js";

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
    router.patch(
      "/admin/users/:userId/activation",
      dependencies.authenticationMiddleware,
      dependencies.adminRoleMiddleware,
      createSetAdminUserActivationHandler(dependencies.adminUserService)
    );
  }
}

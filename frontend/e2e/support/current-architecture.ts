import { expect, type APIResponse, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const currentGatewayUrl = "http://localhost:4001";
export const currentFrontendUrl = "http://localhost:3000";
export const finalE2eTenantPassword = "FinalE2EPass123!";

export const seededAccounts = Object.freeze({
  tenant: { role: "TENANT", email: "demo.tenant@rentmate.local" },
  landlord: { role: "LANDLORD", email: "demo.landlord1@rentmate.local" },
  otherLandlord: { role: "LANDLORD", email: "demo.landlord2@rentmate.local" },
  admin: { role: "ADMIN", email: "demo.admin@rentmate.local" }
} as const);

export interface SeededAccount {
  readonly role: "TENANT" | "LANDLORD" | "ADMIN";
  readonly email: string;
}

export const finalInquiryTenant = Object.freeze({
  role: "TENANT" as const,
  email: "final-e2e-inquiry-tenant@example.test"
});

let passwordPromise: Promise<string> | undefined;

export function seededPassword(): Promise<string> {
  passwordPromise ??= readFile(path.resolve(__dirname, "../../../scripts/seed-dev-microservices.mjs"), "utf8").then(
    (source) => {
      const value = source.match(/const developmentPassword = "([^"]+)";/)?.[1];
      if (!value) throw new Error("Current demo seed password was not found.");
      return value;
    }
  );
  return passwordPromise;
}

export async function gateway(
  context: BrowserContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  requestPath: string,
  body?: object,
  expectedStatus?: number
): Promise<APIResponse> {
  const response = await context.request.fetch(`${currentGatewayUrl}${requestPath}`, {
    method,
    headers: { Origin: currentFrontendUrl },
    ...(body === undefined ? {} : { data: body })
  });
  if (expectedStatus === undefined) {
    expect(response.ok(), `${method} ${requestPath}: ${response.status()} ${await response.text()}`).toBe(true);
  } else {
    expect(response.status(), `${method} ${requestPath}: ${await response.text()}`).toBe(expectedStatus);
  }
  return response;
}

export async function responseData<T>(response: APIResponse): Promise<T> {
  return (await response.json()).data as T;
}

export async function loginThroughUi(page: Page, account: SeededAccount, password?: string): Promise<void> {
  const isAdmin = account.role === "ADMIN";
  await page.goto(isAdmin ? "/admin/login" : "/login");
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(password ?? (await seededPassword()));
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(isAdmin ? /\/admin\/?$/ : /\/$/);
}

export function storageStatePath(account: SeededAccount): string {
  const identity = account.email.replace(/[^a-z0-9]+/giu, "-").replace(/(^-|-$)/g, "");
  return path.resolve(__dirname, `../../.playwright/current-architecture-auth/${identity}.json`);
}

export async function createAuthenticatedContext(browser: Browser, account: SeededAccount): Promise<BrowserContext> {
  return browser.newContext({ storageState: storageStatePath(account) });
}

export async function logoutThroughUi(page: Page): Promise<void> {
  const menu = page.getByRole("button", { name: /Người thuê|Chủ nhà/ });
  await menu.click();
  await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function expectCurrentTopology(context: BrowserContext): Promise<void> {
  const response = await context.request.get(`${currentGatewayUrl}/api/health`);
  expect(response.status()).toBe(200);
}

export function uniqueE2eLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

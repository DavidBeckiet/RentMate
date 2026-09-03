import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import {
  finalE2eTenantPassword,
  finalInquiryTenant,
  gateway,
  loginThroughUi,
  seededAccounts,
  storageStatePath
} from "./support/current-architecture";

test("prepare current-architecture seeded browser sessions", async ({ browser }) => {
  await mkdir(path.dirname(storageStatePath(seededAccounts.tenant)), { recursive: true });
  for (const account of [
    seededAccounts.tenant,
    seededAccounts.landlord,
    seededAccounts.otherLandlord,
    seededAccounts.admin
  ]) {
    const statePath = storageStatePath(account);
    const context = await browser.newContext(existsSync(statePath) ? { storageState: statePath } : undefined);
    const existingSession = await gateway(context, "GET", "/api/v1/users/me", undefined, 200).then(
      () => true,
      () => false
    );
    if (!existingSession) {
      await context.clearCookies();
    }
    const page = await context.newPage();
    if (!existingSession) {
      await loginThroughUi(page, account);
      await context.storageState({ path: statePath });
    }
    await context.close();
  }

  const statePath = storageStatePath(finalInquiryTenant);
  const tenantContext = await browser.newContext(existsSync(statePath) ? { storageState: statePath } : undefined);
  const existingTenantSession = await gateway(tenantContext, "GET", "/api/v1/users/me", undefined, 200).then(
    () => true,
    () => false
  );
  const tenantPage = await tenantContext.newPage();
  if (!existingTenantSession) {
    await tenantPage.goto("/register/tenant");
    await tenantPage.locator("#tenant-registration-display-name").fill("Final E2E inquiry tenant");
    await tenantPage.locator("#tenant-registration-email").fill(finalInquiryTenant.email);
    await tenantPage.locator("#tenant-registration-password").fill(finalE2eTenantPassword);
    await tenantPage.locator("#tenant-registration-confirm-password").fill(finalE2eTenantPassword);
    await tenantPage.getByRole("button", { name: "Đăng ký tìm phòng", exact: true }).click();
    const registered = await tenantPage.waitForURL(/\/$/, { timeout: 8_000 }).then(
      () => true,
      () => false
    );
    if (!registered) await loginThroughUi(tenantPage, finalInquiryTenant, finalE2eTenantPassword);
    await tenantContext.storageState({ path: statePath });
  }
  await tenantContext.close();
});

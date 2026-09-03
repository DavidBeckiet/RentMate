import { expect, test } from "@playwright/test";
import { createAuthenticatedContext, gateway, seededAccounts } from "./support/current-architecture";

test.describe("current architecture: admin authorization and moderation acceptance", () => {
  test("admin dashboard and contact reports use the real Gateway; tenant remains forbidden", async ({ browser }) => {
    const adminContext = await createAuthenticatedContext(browser, seededAccounts.admin);
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("heading", { name: "Hàng đợi kiểm duyệt", exact: true })).toBeVisible();

    const contactResponse = adminPage.waitForResponse(
      (response) => response.url().includes("/api/v1/admin/contact-reports") && response.request().method() === "GET"
    );
    await adminPage.goto("/admin/contact-reports");
    await expect((await contactResponse).status()).toBe(200);
    await expect(adminPage.getByRole("heading", { name: "Báo cáo cuộc trò chuyện", exact: true })).toBeVisible();

    const tenantContext = await createAuthenticatedContext(browser, seededAccounts.tenant);
    const tenantPage = await tenantContext.newPage();
    await tenantPage.goto("/");
    await gateway(tenantContext, "GET", "/api/v1/admin/contact-reports", undefined, 403);
    await tenantPage.goto("/admin/contact-reports");
    await expect(tenantPage.locator("section[role='alert']")).toContainText("Trang này dành cho quản trị viên.");
    await Promise.all([adminContext.close(), tenantContext.close()]);
  });

  test("admin roommate risk review keeps deterministic risk and AI safety presentation separate", async ({
    browser
  }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.admin);
    const page = await context.newPage();
    await page.goto("/admin/roommate-reports");
    await expect(page.getByRole("heading", { name: "Báo cáo ở ghép", exact: true })).toBeVisible();
    await expect(page.getByText(/điểm số kết hợp|combined score/i)).toHaveCount(0);
    const queue = page.getByLabel("Danh sách báo cáo ở ghép");
    if (await queue.getByRole("button", { name: "Xem & xử lý", exact: true }).count()) {
      await queue.getByRole("button", { name: "Xem & xử lý", exact: true }).first().click();
      await expect(page.getByText("Phân tích an toàn bằng AI", { exact: true })).toBeVisible();
      await expect(page.getByText("Ưu tiên xem xét", { exact: true })).toBeVisible();
      await expect(page.getByText(/quyết định của Admin vẫn là bước riêng/i)).toBeVisible();
    }
    await context.close();
  });

  test("admin can inspect, without mutating, the deterministic landlord verification queue", async ({ browser }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.admin);
    const page = await context.newPage();
    await page.goto("/admin/verifications");
    await expect(page.getByRole("heading", { name: "Xác minh chủ trọ", exact: true })).toBeVisible();
    await expect(page.getByText(/Duyệt thủ công hồ sơ/i)).toBeVisible();
    await context.close();
  });
});

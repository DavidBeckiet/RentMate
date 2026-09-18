import { expect, test } from "@playwright/test";
import { createAuthenticatedContext, gateway, responseData, seededAccounts } from "./support/current-architecture";

type DirectoryUser = {
  readonly id: number;
  readonly role: "TENANT" | "LANDLORD" | "ADMIN";
  readonly email: string;
};

const overviewIdentity = {
  accounts: { total: 14, byRole: { TENANT: 8, LANDLORD: 5, ADMIN: 1 }, active: 13, inactive: 1 },
  verifications: { pending: 0 },
  capturedAt: "2026-09-17T00:00:00.000Z"
};
const overviewListings = {
  listings: {
    total: 8,
    byStatus: { DRAFT: 1, PENDING: 0, APPROVED: 5, REJECTED: 1, HIDDEN: 0, INACTIVE: 1 }
  },
  listingReports: { open: 0, investigating: 0 },
  capturedAt: "2026-09-17T00:00:00.000Z"
};
const overviewEngagement = {
  support: { open: 0, inProgress: 0 },
  reviews: { pending: 0 },
  contactReports: { open: 0, investigating: 0 },
  roommateReports: { open: 0, investigating: 0 },
  reviewReports: { open: 0, investigating: 0 },
  capturedAt: "2026-09-17T00:00:00.000Z"
};

async function fulfillOverview(page: import("@playwright/test").Page, path: string, data: object) {
  await page.route(`**/api/v1/admin/overview/${path}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ data }) })
  );
}

test.describe("current architecture: admin authorization and moderation acceptance", () => {
  test("admin overview, listings queue, and contact reports use the real Gateway; tenant remains forbidden", async ({
    browser
  }) => {
    const adminContext = await createAuthenticatedContext(browser, seededAccounts.admin);
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("heading", { name: "Tổng quan quản trị", exact: true })).toBeVisible();
    await expect(adminPage.getByRole("link", { name: /tin chờ duyệt/i }).first()).toHaveAttribute(
      "href",
      "/admin/listings"
    );
    await adminPage
      .getByRole("link", { name: /tin chờ duyệt/i })
      .first()
      .click();
    await expect(adminPage.getByRole("heading", { name: "Kiểm duyệt tin", exact: true })).toBeVisible();

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
    await queue.getByRole("link", { name: "Xem và xử lý", exact: true }).first().click();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByText("Phân tích an toàn bằng AI", { exact: true })).toBeVisible();
    await expect(page.getByText("Ưu tiên xem xét", { exact: true })).toBeVisible();
    await expect(page.getByText(/quyết định của Admin vẫn là bước riêng/i)).toBeVisible();
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

  test("admin overview remains compact at mobile width and supports authoritative all-clear state", async ({
    browser
  }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.admin);
    const page = await context.newPage();
    await fulfillOverview(page, "identity", overviewIdentity);
    await fulfillOverview(page, "listings", overviewListings);
    await fulfillOverview(page, "engagement", overviewEngagement);

    await page.goto("/admin");
    await expect(page.getByText("Hiện không có việc đang chờ xử lý.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Làm mới số liệu" }).click();
    await expect(page.getByRole("link", { name: "Đã duyệt kiểm duyệt" })).toHaveAttribute(
      "href",
      "/admin/listings?status=APPROVED"
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Tổng quan quản trị", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toHaveCount(1);
    await context.close();
  });

  test("admin overview keeps workflow links when one overview source fails", async ({ browser }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.admin);
    const page = await context.newPage();
    await fulfillOverview(page, "identity", overviewIdentity);
    await page.route("**/api/v1/admin/overview/listings", (route) => route.fulfill({ status: 503 }));
    await fulfillOverview(page, "engagement", overviewEngagement);

    await page.goto("/admin");
    await expect(page.getByText("Chưa tải được", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "tin chờ duyệt", exact: true })).toHaveAttribute(
      "href",
      "/admin/listings"
    );
    await expect(page.getByText("Hiện không có việc đang chờ xử lý.", { exact: true })).toHaveCount(0);
    await context.close();
  });

  test("admin uses the account directory and dedicated account workspace on desktop and mobile", async ({
    browser
  }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.admin);
    const findSeededUser = async (email: string) =>
      (
        await responseData<DirectoryUser[]>(
          await gateway(context, "GET", `/api/v1/admin/users?q=${encodeURIComponent(email)}`)
        )
      )[0];
    const tenant = await findSeededUser(seededAccounts.tenant.email);
    const landlord = await findSeededUser(seededAccounts.landlord.email);
    const admin = await findSeededUser(seededAccounts.admin.email);
    if (!tenant || !landlord || !admin) throw new Error("Current architecture admin seeds are incomplete.");

    const page = await context.newPage();
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Người dùng", exact: true })).toBeVisible();
    await expect(page.getByText("Danh bạ tài khoản", { exact: true })).toBeVisible();
    await expect(page.getByText("Tài khoản trong trang", { exact: true })).toHaveCount(0);

    await page.getByLabel("Tìm tài khoản").fill(tenant.email);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByText(tenant.email, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Xem tài khoản/ }).click();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByText("Thông tin người dùng", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Về danh sách người dùng" })).toHaveAttribute("href", /q=/);

    await page.goto(`/admin/users/${landlord.id}`);
    await page.getByRole("button", { name: "Ngừng hoạt động" }).click();
    await expect(page.getByRole("dialog", { name: "Ngừng hoạt động tài khoản?" })).toContainText(
      "vẫn giữ nguyên trạng thái"
    );
    await page.keyboard.press("Escape");

    await page.goto(`/admin/users/${admin.id}`);
    await expect(page.getByText("Tài khoản quản trị được hiển thị ở chế độ chỉ xem.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Ngừng hoạt động|Kích hoạt lại/ })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Người dùng", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    await context.close();
  });
});

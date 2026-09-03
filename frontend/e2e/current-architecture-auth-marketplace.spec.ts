import { expect, test } from "@playwright/test";
import {
  createAuthenticatedContext,
  expectCurrentTopology,
  finalInquiryTenant,
  gateway,
  responseData,
  seededAccounts,
  uniqueE2eLabel
} from "./support/current-architecture";

interface PublicListing {
  readonly id: number;
  readonly title: string;
}

test.describe("current architecture: authentication and marketplace acceptance", () => {
  test("public discovery, filtering, detail, map surface, and comparison are available", async ({ page, context }) => {
    await expectCurrentTopology(context);
    const listings = await responseData<readonly PublicListing[]>(
      await gateway(context, "GET", "/api/v1/listings?page=1&pageSize=10")
    );
    expect(listings.length).toBeGreaterThanOrEqual(2);

    await page.goto("/search");
    await expect(page.getByRole("main", { name: "Kết quả tìm phòng" })).toBeVisible();
    const filter = page.getByRole("form", { name: "Bộ lọc tìm phòng" });
    await filter.getByLabel("Từ khóa").fill(listings[0]!.title.split(" ")[0]!);
    await filter.getByLabel("Từ khóa").press("Enter");
    await expect(page.getByText(listings[0]!.title, { exact: true }).first()).toBeVisible();

    await page.goto(`/listings/${listings[0]!.id}`);
    await expect(page.getByRole("heading", { name: listings[0]!.title, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Vị trí xấp xỉ" })).toBeVisible();

    await page.goto("/near-me");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(/Bản đồ không tự gửi yêu cầu/i)).toBeVisible();

    for (const listing of listings.slice(0, 2)) {
      await page.goto(`/listings/${listing.id}`);
      await page.getByRole("button", { name: "Thêm vào so sánh", exact: true }).click();
    }
    await page.goto("/compare");
    await expect(page.getByRole("heading", { name: "So sánh tin đăng", exact: true })).toBeVisible();
    await expect(page.getByText(listings[0]!.title, { exact: true }).first()).toBeVisible();
  });

  test("current registration validates display name and the registered tenant can log out through the UI", async ({
    page,
    browser
  }) => {
    await page.goto("/register/tenant");
    await page.getByRole("button", { name: "Đăng ký tìm phòng", exact: true }).click();
    await expect(page.getByText("Vui lòng nhập họ và tên.", { exact: true })).toBeVisible();

    const context = await createAuthenticatedContext(browser, finalInquiryTenant);
    const registeredPage = await context.newPage();
    await registeredPage.goto("/");
    await expect(registeredPage.getByRole("button", { name: /Người thuê/ })).toBeVisible();
    await registeredPage.getByRole("button", { name: /Người thuê/ }).click();
    await registeredPage.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
    await expect(
      registeredPage.getByRole("banner").getByRole("link", { name: "Đăng nhập", exact: true })
    ).toBeVisible();
    await context.close();
  });

  test("tenant favorites, saved search, and private note persist through the Gateway", async ({ browser }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.tenant);
    const page = await context.newPage();
    const listings = await responseData<readonly PublicListing[]>(
      await gateway(context, "GET", "/api/v1/listings?page=1&pageSize=10")
    );
    const listing = listings[0]!;

    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: "Lưu tin", exact: true }).click();
    await expect(page.getByRole("button", { name: "Đã lưu", exact: true })).toBeVisible();
    await page.goto("/favorites");
    await expect(page.getByText(listing.title, { exact: true }).first()).toBeVisible();

    const savedSearchName = uniqueE2eLabel("final-saved-search");
    await gateway(context, "POST", "/api/v1/saved-searches", {
      name: savedSearchName,
      isActive: true,
      query: {
        q: null,
        areaName: null,
        minMonthlyRent: null,
        maxMonthlyRent: null,
        minRoomAreaSqm: null,
        maxRoomAreaSqm: null,
        minOccupants: null,
        propertyType: null,
        amenities: [],
        mode: "ordinary",
        sort: "newest"
      }
    });
    await page.goto("/saved-searches");
    await expect(page.getByText(savedSearchName, { exact: true })).toBeVisible();

    const note = uniqueE2eLabel("final-private-note");
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("textbox", { name: "Ghi chú riêng", exact: true }).fill(note);
    await page.getByRole("button", { name: "Lưu ghi chú", exact: true }).click();
    await expect(page.getByText("Đã lưu ghi chú riêng.", { exact: true })).toBeVisible();
    const notes = await responseData<readonly { readonly listingId: number; readonly note: string }[]>(
      await gateway(context, "GET", `/api/v1/tenant/listing-notes?listingIds=${listing.id}`)
    );
    expect(notes).toContainEqual(expect.objectContaining({ listingId: listing.id, note }));
    await context.close();
  });

  test("tenant, landlord, and admin authenticate to their role workspaces; invalid login is rejected", async ({
    browser
  }) => {
    const invalidContext = await browser.newContext();
    const invalid = await invalidContext.newPage();
    await invalid.goto("/login");
    await invalid.locator("#login-email").fill(`${uniqueE2eLabel("invalid-login")}@example.test`);
    await invalid.locator("#login-password").fill("incorrect-password");
    await invalid.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(invalid.locator("section[role='alert']")).toContainText(
      /Email hoặc mật khẩu không đúng|Bạn đã thử đăng nhập quá nhiều lần/
    );

    const tenantContext = await createAuthenticatedContext(browser, seededAccounts.tenant);
    const tenant = await tenantContext.newPage();
    await tenant.goto("/");
    await expect(tenant.getByRole("button", { name: /Người thuê/ })).toBeVisible();

    const landlordContext = await createAuthenticatedContext(browser, seededAccounts.landlord);
    const landlord = await landlordContext.newPage();
    await landlord.goto("/landlord");
    await expect(landlord.getByRole("heading", { name: "Quản lý tin cho thuê", exact: true })).toBeVisible();

    const adminContext = await createAuthenticatedContext(browser, seededAccounts.admin);
    const admin = await adminContext.newPage();
    await admin.goto("/admin");
    await expect(admin.getByRole("heading", { name: "Hàng đợi kiểm duyệt", exact: true })).toBeVisible();
    await Promise.all([invalidContext.close(), tenantContext.close(), landlordContext.close(), adminContext.close()]);
  });
});

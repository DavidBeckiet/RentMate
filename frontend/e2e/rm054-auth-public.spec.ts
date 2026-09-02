import { expect, test } from "@playwright/test";
import {
  createActor,
  createRm054Context,
  expectNoJavascriptSessionToken,
  login,
  logout,
  register,
  resetRm054,
  seedApprovedListing
} from "./support/rm054-fixtures";

test.describe("RM-054 authentication and public discovery", () => {
  test("tenant registration, logout, and login retain navigation without a JavaScript token", async ({ browser }) => {
    const context = await createRm054Context(browser);
    const page = await context.newPage();
    await resetRm054(page);
    const tenant = createActor("TENANT", "auth-navigation");

    await register(page, tenant);
    await expectNoJavascriptSessionToken(page);
    await logout(page);
    await login(page, tenant);
    await expect(page.getByRole("link", { name: "Tin đã lưu" })).toBeVisible();
    await expectNoJavascriptSessionToken(page);
    await context.close();
  });

  test("anonymous and active tenant receive the intended public-detail privacy projection", async ({ browser }) => {
    const context = await createRm054Context(browser, {
      geolocation: { latitude: 10.7724, longitude: 106.6981 },
      allowGeolocation: true
    });
    const page = await context.newPage();
    const listingId = await seedApprovedListing(page);

    await page.goto("/");
    await page.getByLabel("Bạn muốn sống ở đâu?", { exact: true }).fill("RM054");
    await page.getByRole("button", { name: "Tìm phòng" }).click();
    await expect(page).toHaveURL(/\/search\?q=RM054/);
    await expect(page.getByRole("link", { name: /Phòng RM054 công khai/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Xem bản đồ" }).click();
    await expect(page.getByRole("region", { name: "Bản đồ vị trí xấp xỉ của các tin đăng" })).toBeVisible();
    await expect(page.getByText("OpenStreetMap", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect(page.getByText("Đã chọn tâm tìm kiếm")).toBeVisible();
    await page.getByLabel("Bán kính (km)").fill("3");
    await page.getByRole("button", { name: "Tìm theo bán kính" }).click();
    await expect(page).toHaveURL(/radiusKm=3/);

    await page
      .getByRole("link", { name: /Phòng RM054 công khai/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Phòng RM054 công khai" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vị trí xấp xỉ" })).toBeVisible();
    await expect(page.getByText("12 Đường RM054, Quận 1")).not.toBeVisible();
    await expect(page.getByText("rm054.public.landlord@example.test")).not.toBeVisible();

    const tenant = createActor("TENANT", "public-contact");
    await register(page, tenant);
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByText("rm054.public.landlord@example.test")).toBeVisible();
    await expect(page.getByText("+84901111111")).toBeVisible();
    await context.close();
  });
});

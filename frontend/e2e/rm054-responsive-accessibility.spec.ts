import { expect, test, type Browser } from "@playwright/test";
import {
  completeDraft,
  createActor,
  createDraft,
  createRm054Context,
  login,
  logout,
  moderate,
  openAdminListing,
  register,
  resetRm054,
  rm054Admin,
  submitDraft,
  uploadRoomImage
} from "./support/rm054-fixtures";

function projectContextOptions(projectName: string) {
  const mobile = projectName === "mobile-chromium";
  return mobile
    ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } };
}

async function runTabletAcceptanceSmoke(browser: Browser): Promise<void> {
  const context = await createRm054Context(browser, { viewport: { width: 768, height: 1024 } });
  const page = await context.newPage();
  await resetRm054(page, "public");
  await page.goto("/");
  await page.getByLabel("Tên phòng hoặc khu vực").fill("RM054");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page.getByText("Phòng RM054 công khai", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  const landlord = createActor("LANDLORD", "tablet-owner");
  await register(page, landlord);
  const listingId = await createDraft(page);
  await completeDraft(page, "Phòng RM054 tablet");
  await uploadRoomImage(page);
  await submitDraft(page);

  await logout(page);
  await login(page, rm054Admin);
  await openAdminListing(page, listingId);
  await moderate(page, "Từ chối", "RM-054 tablet kiểm tra lý do từ chối.");
  await logout(page);
  await login(page, landlord);
  await page.goto(`/landlord/listings/${listingId}`);
  await expect(page.getByText("RM-054 tablet kiểm tra lý do từ chối.")).toBeVisible();
  await context.close();
}

test.describe("RM-054 responsive and accessible critical UI", () => {
  test("app shell, public map, reduced motion, skip link, and mobile menu retain accessible interaction", async ({
    browser
  }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-chromium";
    const context = await createRm054Context(browser, projectContextOptions(testInfo.project.name));
    const page = await context.newPage();
    await resetRm054(page, "public");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const skipLink = page.getByRole("link", { name: "Bỏ qua đến nội dung chính" });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.getByRole("textbox", { name: "Tên phòng hoặc khu vực" })).toBeVisible();
    await expect(page.getByLabel("Bán kính (km)")).toBeVisible();

    if (mobile) {
      const menu = page.getByRole("button", { name: /(?:Mở|Đóng) menu điều hướng/ });
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      const box = await menu.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("button", { name: "Xem bản đồ" }).click();
    }

    await expect(page.getByRole("region", { name: "Bản đồ vị trí xấp xỉ của các tin đăng" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);
    if (!mobile) await runTabletAcceptanceSmoke(browser);
    await context.close();
  });

  test("auth, owner image, moderator reason, and activation controls expose semantic labels and keyboard focus", async ({
    browser
  }, testInfo) => {
    const context = await createRm054Context(browser, projectContextOptions(testInfo.project.name));
    const page = await context.newPage();
    await resetRm054(page);
    await page.goto("/login");
    await page.getByLabel("Email").focus();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByLabel("Mật khẩu")).toBeVisible();

    await register(page, createActor("LANDLORD", "responsive-owner"));
    const listingId = await createDraft(page);
    await completeDraft(page, "Phòng RM054 accessibility");
    await expect(page.getByLabel("Chọn một ảnh")).toBeVisible();
    await uploadRoomImage(page);
    await submitDraft(page);

    await logout(page);
    await login(page, rm054Admin);
    await openAdminListing(page, listingId);
    await page.getByRole("button", { name: "Từ chối" }).click();
    await expect(page.getByLabel("Lý do")).toBeVisible();
    await expect(page.getByRole("button", { name: "Xác nhận hành động" })).toBeVisible();
    await page.getByRole("button", { name: "Hủy" }).click();
    await page.goto("/admin/users");
    await expect(page.getByLabel("Vai trò")).toBeVisible();
    await expect(page.getByLabel("Trạng thái tài khoản")).toBeVisible();
    await context.close();
  });
});

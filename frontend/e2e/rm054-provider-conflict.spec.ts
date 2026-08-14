import { expect, test, type Page } from "@playwright/test";
import {
  completeDraft,
  createActor,
  createDraft,
  createRm054Context,
  login,
  moderate,
  openAdminListing,
  register,
  resetRm054,
  rm054Admin,
  rm054ProviderFailureAddress,
  submitDraft,
  uploadProviderFailureImage,
  uploadRoomImage
} from "./support/rm054-fixtures";

async function uploadToImageCount(page: Page, imageCount: number): Promise<void> {
  await uploadRoomImage(page);
  await expect(page.getByText(`${imageCount}/8 ảnh`)).toBeVisible();
}

test.describe("RM-054 provider failures and real moderation conflict", () => {
  test("explicit geocoding and image retries preserve the draft and never retry automatically", async ({ browser }) => {
    const context = await createRm054Context(browser);
    const page = await context.newPage();
    await resetRm054(page);
    await register(page, createActor("LANDLORD", "provider-retry"));
    await createDraft(page);

    let geocodeRequests = 0;
    let imageUploadRequests = 0;
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      if (request.url().endsWith("/api/v1/geocoding/forward")) geocodeRequests += 1;
      if (/\/api\/v1\/landlord\/listings\/\d+\/images$/.test(request.url())) imageUploadRequests += 1;
    });

    await page.getByLabel("Địa chỉ chính xác").fill(rm054ProviderFailureAddress);
    await page.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }).click();
    await expect(page.getByText("Dịch vụ định vị tạm thời không khả dụng.")).toBeVisible();
    await expect(page.getByLabel("Địa chỉ chính xác")).toHaveValue(rm054ProviderFailureAddress);
    expect(geocodeRequests).toBe(1);
    await expect(page.getByRole("button", { name: "Gửi duyệt" })).toBeVisible();

    await completeDraft(page, "Phòng RM054 lỗi nhà cung cấp", { useGeocode: true });
    expect(geocodeRequests).toBe(2);
    await uploadProviderFailureImage(page);
    await expect(page.getByText("Dịch vụ lưu ảnh tạm thời không khả dụng.")).toBeVisible();
    await expect(page.getByText("0/8 ảnh")).toBeVisible();
    expect(imageUploadRequests).toBe(1);

    await uploadToImageCount(page, 1);
    expect(imageUploadRequests).toBe(2);

    await uploadToImageCount(page, 2);
    await page.getByRole("button", { name: "Đưa ảnh 2 lên" }).click();
    await page.getByRole("button", { name: "Lưu thứ tự ảnh" }).click();
    await expect(page.getByText("Đã lưu thứ tự ảnh.")).toBeVisible();

    await page.getByRole("button", { name: "Xóa ảnh 2" }).click();
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByText("1/8 ảnh")).toBeVisible();

    await page.getByRole("button", { name: "Thay ảnh 1" }).click();
    await page.getByRole("button", { name: "Ảnh mới", exact: true }).setInputFiles("e2e/fixtures/rm054-room.jpg");
    await page.getByRole("button", { name: "Tải ảnh mới" }).click();
    await expect(page.getByText("Ảnh mới đã được tải lên. Xóa ảnh cũ để hoàn tất.")).toBeVisible();
    await page.getByRole("button", { name: "Xóa ảnh cũ để hoàn tất" }).click();
    await page.getByRole("button", { name: "Xác nhận xóa" }).click();
    await expect(page.getByText("Đã xóa ảnh cũ và hoàn tất các bước thay ảnh.")).toBeVisible();

    for (let imageCount = 2; imageCount <= 8; imageCount += 1) await uploadToImageCount(page, imageCount);
    await expect(page.getByText("8/8 ảnh")).toBeVisible();
    await page.getByRole("button", { name: "Thay ảnh 1" }).click();
    await page.getByRole("button", { name: "Ảnh mới", exact: true }).setInputFiles("e2e/fixtures/rm054-room.jpg");
    await page.getByRole("button", { name: "Xóa ảnh cũ trước" }).click();
    await page.getByRole("button", { name: "Xác nhận xóa" }).click();
    await expect(page.getByText("Ảnh cũ đã được xóa. Tải ảnh mới để hoàn tất.")).toBeVisible();
    await page.getByRole("button", { name: "Tải ảnh mới để hoàn tất" }).click();
    await expect(page.getByText("Đã tải ảnh mới và hoàn tất các bước thay ảnh.")).toBeVisible();
    await expect(page.getByText("8/8 ảnh")).toBeVisible();
    await context.close();
  });

  test("two admin browser contexts surface a real stale 409 and reload the canonical approved state", async ({
    browser
  }) => {
    const landlordContext = await createRm054Context(browser);
    const landlordPage = await landlordContext.newPage();
    await resetRm054(landlordPage);
    await register(landlordPage, createActor("LANDLORD", "conflict-landlord"));
    const listingId = await createDraft(landlordPage);
    await completeDraft(landlordPage, "Phòng RM054 conflict");
    await uploadRoomImage(landlordPage);
    await submitDraft(landlordPage);

    const firstAdminContext = await createRm054Context(browser);
    const firstAdminPage = await firstAdminContext.newPage();
    await login(firstAdminPage, rm054Admin);
    await openAdminListing(firstAdminPage, listingId);

    const secondAdminContext = await createRm054Context(browser);
    const secondAdminPage = await secondAdminContext.newPage();
    await login(secondAdminPage, rm054Admin);
    await openAdminListing(secondAdminPage, listingId);
    await moderate(secondAdminPage, "Duyệt tin");

    await firstAdminPage.getByRole("button", { name: "Từ chối" }).click();
    await firstAdminPage.getByLabel("Lý do").fill("Yêu cầu cũ phải trả về conflict.");
    await firstAdminPage.getByRole("button", { name: "Xác nhận hành động" }).click();
    await expect(firstAdminPage.getByText(/Trạng thái tin đã thay đổi/)).toBeVisible();
    await expect(firstAdminPage.getByText(/Trạng thái tin đăng: Đã duyệt/)).toBeVisible();
    await expect(firstAdminPage.getByRole("heading", { name: "Lịch sử kiểm duyệt" })).toBeVisible();

    await secondAdminContext.close();
    await firstAdminContext.close();
    await landlordContext.close();
  });
});

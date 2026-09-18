import { expect, test } from "@playwright/test";
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
  submitDraft,
  uploadRoomImage
} from "./support/rm054-fixtures";

test.describe("RM-054 cross-actor browser flows", () => {
  test("landlord, admin, anonymous visitor, and tenant complete the visibility and favorite flow", async ({
    browser
  }) => {
    const landlordContext = await createRm054Context(browser);
    const landlordPage = await landlordContext.newPage();
    await resetRm054(landlordPage);
    const landlord = createActor("LANDLORD", "cross-actor-landlord");
    await register(landlordPage, landlord);
    const listingId = await createDraft(landlordPage);
    const title = "Phòng RM054 xuyên vai trò";
    await completeDraft(landlordPage, title, { useGeocode: true });
    await uploadRoomImage(landlordPage);
    await submitDraft(landlordPage);

    const adminContext = await createRm054Context(browser);
    const adminPage = await adminContext.newPage();
    await login(adminPage, rm054Admin);
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("heading", { name: "Kiểm duyệt tin" })).toBeVisible();
    await expect(adminPage.getByText(title, { exact: true })).toBeVisible();
    await adminPage.getByRole("link", { name: "Xem chi tiết" }).click();
    await expect(adminPage).toHaveURL(new RegExp(`/admin/listings/${listingId}$`));
    await moderate(adminPage, "Duyệt tin");
    await expect(adminPage.getByText(/Trạng thái tin đăng: Đã duyệt/)).toBeVisible();

    const tenantContext = await createRm054Context(browser);
    const tenantPage = await tenantContext.newPage();
    const tenant = createActor("TENANT", "cross-actor-tenant");
    await register(tenantPage, tenant);
    await tenantPage.goto(`/listings/${listingId}`);
    await expect(tenantPage.getByText(landlord.email)).toBeVisible();
    await tenantPage.getByRole("button", { name: "Lưu tin" }).click();
    await expect(tenantPage.getByRole("button", { name: "Đã lưu" })).toBeVisible();
    await tenantPage.goto("/favorites");
    await expect(tenantPage.getByText(title, { exact: true })).toBeVisible();
    await tenantPage.getByRole("button", { name: "Bỏ lưu" }).click();
    await expect(tenantPage.getByText("Hiện chưa có tin đã lưu nào đang công khai.")).toBeVisible();

    await openAdminListing(adminPage, listingId);
    await moderate(adminPage, "Ẩn tin", "RM-054 kiểm tra ẩn công khai");
    const anonymousContext = await createRm054Context(browser);
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`/listings/${listingId}`);
    await expect(anonymousPage.getByText("Tin đăng không tồn tại hoặc hiện không khả dụng.")).toBeVisible();

    await openAdminListing(adminPage, listingId);
    await moderate(adminPage, "Khôi phục");
    await anonymousPage.reload();
    await expect(anonymousPage.getByRole("heading", { name: title })).toBeVisible();

    await anonymousContext.close();
    await tenantContext.close();
    await adminContext.close();
    await landlordContext.close();
  });

  test("admin activation removes and restores an approved landlord listing without changing its status", async ({
    browser
  }) => {
    const landlordContext = await createRm054Context(browser);
    const landlordPage = await landlordContext.newPage();
    await resetRm054(landlordPage);
    const landlord = createActor("LANDLORD", "activation-landlord");
    await register(landlordPage, landlord);
    const listingId = await createDraft(landlordPage);
    const title = "Phòng RM054 kích hoạt chủ nhà";
    await completeDraft(landlordPage, title);
    await uploadRoomImage(landlordPage);
    await submitDraft(landlordPage);

    const adminContext = await createRm054Context(browser);
    const adminPage = await adminContext.newPage();
    await login(adminPage, rm054Admin);
    await openAdminListing(adminPage, listingId);
    await moderate(adminPage, "Duyệt tin");

    const publicContext = await createRm054Context(browser);
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/listings/${listingId}`);
    await expect(publicPage.getByRole("heading", { name: title })).toBeVisible();

    await adminPage.goto("/admin/users");
    await adminPage.getByLabel("Vai trò").selectOption("LANDLORD");
    await expect(adminPage.getByText(landlord.email)).toBeVisible();
    await adminPage.getByRole("button", { name: "Ngừng hoạt động" }).click();
    await adminPage.getByRole("button", { name: "Xác nhận" }).click();
    await expect(adminPage.getByRole("button", { name: "Kích hoạt lại" })).toBeVisible();

    await publicPage.reload();
    await expect(publicPage.getByText("Tin đăng không tồn tại hoặc hiện không khả dụng.")).toBeVisible();
    await landlordPage.reload();
    await expect(landlordPage.getByLabel("Điều hướng chính").getByRole("link", { name: "Đăng nhập" })).toBeVisible();

    await adminPage.getByRole("button", { name: "Kích hoạt lại" }).click();
    await adminPage.getByRole("button", { name: "Xác nhận" }).click();
    await expect(adminPage.getByRole("button", { name: "Ngừng hoạt động" })).toBeVisible();
    await publicPage.reload();
    await expect(publicPage.getByRole("heading", { name: title })).toBeVisible();

    await publicContext.close();
    await adminContext.close();
    await landlordContext.close();
  });
});

import { expect, test } from "@playwright/test";
import {
  createAuthenticatedContext,
  finalInquiryTenant,
  gateway,
  responseData,
  seededAccounts,
  uniqueE2eLabel
} from "./support/current-architecture";

interface OwnedListing {
  readonly id: number;
  readonly title: string;
}

async function removeFinalE2eDrafts(browser: Parameters<typeof createAuthenticatedContext>[0]): Promise<void> {
  const context = await createAuthenticatedContext(browser, seededAccounts.landlord);
  try {
    const listings = await responseData<
      readonly { readonly id: number; readonly title: string; readonly status: string }[]
    >(await gateway(context, "GET", "/api/v1/landlord/listings?page=1&pageSize=50"));
    for (const listing of listings) {
      if (listing.status === "DRAFT" && listing.title.startsWith("final-landlord-listing-")) {
        await gateway(context, "DELETE", `/api/v1/landlord/listings/${listing.id}`);
      }
    }
  } finally {
    await context.close();
  }
}

test.describe.serial("current architecture: landlord listing and tenant inquiry acceptance", () => {
  let listingId: number;
  let listingTitle: string;

  test.beforeAll(async ({ browser }) => {
    await removeFinalE2eDrafts(browser);
  });

  test.afterAll(async ({ browser }) => {
    await removeFinalE2eDrafts(browser);
  });

  test("landlord creates and edits a test-owned draft from the workspace", async ({ browser }) => {
    const context = await createAuthenticatedContext(browser, seededAccounts.landlord);
    const page = await context.newPage();
    await page.goto("/landlord");
    await page.getByRole("button", { name: "Tạo tin mới", exact: true }).click();
    await expect(page).toHaveURL(/\/landlord\/listings\/\d+$/);
    const matched = page.url().match(/\/landlord\/listings\/(\d+)$/);
    expect(matched?.[1]).toBeTruthy();
    listingId = Number(matched![1]);
    listingTitle = uniqueE2eLabel("final-landlord-listing");

    await page.getByLabel("Tiêu đề", { exact: true }).fill(listingTitle);
    await page.getByLabel("Mô tả", { exact: true }).fill("Tin đăng test-owned cho E2E current architecture.");
    await page.getByLabel("Giá thuê mỗi tháng", { exact: true }).fill("5200000");
    await page.getByLabel("Diện tích (m²)", { exact: true }).fill("24");
    await page.getByLabel("Sức chứa tối đa", { exact: true }).fill("2");
    await page.getByLabel("Địa chỉ chính xác", { exact: true }).fill("12 Đường Final E2E, Quận 1");
    await page.getByLabel("Tên khu vực", { exact: true }).fill("Quận 1");
    await page.getByLabel("Vĩ độ", { exact: true }).fill("10.7724");
    await page.getByLabel("Kinh độ", { exact: true }).fill("106.6981");
    await page.getByLabel("Loại phòng", { exact: true }).selectOption("ROOM");
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await expect(page.getByText("Đã lưu thay đổi.", { exact: true })).toBeVisible();

    const persisted = await responseData<OwnedListing>(
      await gateway(context, "GET", `/api/v1/landlord/listings/${listingId}`)
    );
    expect(persisted.title).toBe(listingTitle);
    await page.getByLabel("Tiêu đề", { exact: true }).fill(`${listingTitle} đã chỉnh sửa`);
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await expect(page.getByText("Đã lưu thay đổi.", { exact: true })).toBeVisible();
    listingTitle = `${listingTitle} đã chỉnh sửa`;
    await context.close();
  });

  test("ownership remains server-authoritative and a tenant inquiry reaches the landlord workspace", async ({
    browser
  }) => {
    expect(listingId).toBeTruthy();
    const otherLandlordContext = await createAuthenticatedContext(browser, seededAccounts.otherLandlord);
    const otherLandlordPage = await otherLandlordContext.newPage();
    await otherLandlordPage.goto("/landlord");
    await gateway(otherLandlordContext, "GET", `/api/v1/landlord/listings/${listingId}`, undefined, 404);

    const landlordContext = await createAuthenticatedContext(browser, seededAccounts.landlord);
    const landlordPage = await landlordContext.newPage();
    await landlordPage.goto("/landlord");
    const landlordListings = await responseData<readonly { readonly id: number; readonly status: string }[]>(
      await gateway(landlordContext, "GET", "/api/v1/landlord/listings?page=1&pageSize=20")
    );
    const publicListing = landlordListings.find((item) => item.status === "APPROVED");
    expect(publicListing, "The current demo seed needs one approved listing owned by landlord1.").toBeTruthy();

    const tenantContext = await createAuthenticatedContext(browser, finalInquiryTenant);
    const tenantPage = await tenantContext.newPage();
    await tenantPage.goto(`/listings/${publicListing!.id}`);
    const message = uniqueE2eLabel("final-inquiry");
    const inquiry = await responseData<{ readonly id: number; readonly message: string }>(
      await gateway(tenantContext, "POST", "/api/v1/inquiries", {
        listingId: publicListing!.id,
        message,
        contactPhone: null,
        preferredContactAt: null
      })
    );

    await landlordPage.goto(`/inquiries/${inquiry.id}`);
    await expect(landlordPage.getByText(message, { exact: true })).toBeVisible();
    await expect(landlordPage.getByRole("heading").first()).toBeVisible();
    const persisted = await responseData<{
      readonly id: number;
      readonly listingId: number;
      readonly messages: readonly { body: string }[];
    }>(await gateway(landlordContext, "GET", `/api/v1/inquiries/${inquiry.id}`));
    expect(persisted.listingId).toBe(publicListing!.id);
    expect(persisted.messages.some((item) => item.body === message)).toBe(true);
    await gateway(landlordContext, "PATCH", `/api/v1/inquiries/${inquiry.id}/status`, { status: "CONTACTED" });
    await gateway(landlordContext, "PATCH", `/api/v1/inquiries/${inquiry.id}/status`, { status: "CLOSED" });

    await Promise.all([otherLandlordContext.close(), tenantContext.close(), landlordContext.close()]);
  });
});

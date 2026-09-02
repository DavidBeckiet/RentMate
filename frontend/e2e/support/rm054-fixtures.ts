import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const rm054FrontendUrl = "http://localhost:3100";
export const rm054BackendUrl = "http://localhost:4100";
export const rm054Admin = Object.freeze({
  role: "ADMIN" as const,
  email: "rm054.admin@example.test",
  password: "Rm054AdminPass123"
});
export const rm054ProviderFailureAddress = "RM054_PROVIDER_FAILURE";

const roomImagePath = path.resolve(__dirname, "../fixtures/rm054-room.jpg");
const providerFailureImagePath = path.resolve(__dirname, "../fixtures/rm054-provider-failure.png");
let actorSequence = 0;

export type Rm054ActorRole = "TENANT" | "LANDLORD";

export interface Rm054Actor {
  readonly role: Rm054ActorRole;
  readonly email: string;
  readonly password: string;
  readonly phone?: string;
}

export interface Rm054ScenarioResponse {
  readonly preset: "empty" | "public";
  readonly listingId?: number;
  readonly landlordId?: number;
}

export function createActor(role: Rm054ActorRole, label: string): Rm054Actor {
  actorSequence += 1;
  const normalizedLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return Object.freeze({
    role,
    email: `rm054.${normalizedLabel}.${actorSequence}@example.test`,
    password: "Rm054BrowserPass123",
    ...(role === "LANDLORD" ? { phone: `+849011${String(actorSequence).padStart(5, "0")}` } : {})
  });
}

export async function createRm054Context(
  browser: Browser,
  options: Readonly<{
    geolocation?: Readonly<{ latitude: number; longitude: number }>;
    allowGeolocation?: boolean;
    viewport?: Readonly<{ width: number; height: number }>;
    isMobile?: boolean;
    hasTouch?: boolean;
  }> = {}
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: rm054FrontendUrl,
    ...(options.geolocation ? { geolocation: options.geolocation } : {}),
    ...(options.allowGeolocation ? { permissions: ["geolocation"] } : {}),
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.isMobile ? { isMobile: true } : {}),
    ...(options.hasTouch ? { hasTouch: true } : {})
  });
  const roomImage = await readFile(roomImagePath);

  await context.route(/\/_next\/image(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: roomImage })
  );
  await context.route(/https:\/\/(?:[a-c]\.)?tile\.openstreetmap\.org\/.+/, (route) => route.abort());
  await context.route(/https:\/\/res\.cloudinary\.com\/rentmate\/.+/, (route) => route.abort());

  return context;
}

export async function resetRm054(page: Page, preset: "empty" | "public" = "empty"): Promise<Rm054ScenarioResponse> {
  const response = await page.request.post(`${rm054BackendUrl}/__rm054/reset`, {
    headers: { Origin: rm054FrontendUrl },
    data: { preset }
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as Rm054ScenarioResponse;
}

async function revealResponsiveNavigation(page: Page): Promise<void> {
  const menu = page.getByRole("button", { name: "Mở menu điều hướng" });
  if (await menu.isVisible().catch(() => false)) await menu.click();
}

export async function register(page: Page, actor: Rm054Actor): Promise<void> {
  await page.goto(actor.role === "TENANT" ? "/register/tenant" : "/register/landlord");
  await page.getByLabel("Họ và tên (bắt buộc)", { exact: true }).fill("Nguyen Van An");
  await page.getByLabel("Email").fill(actor.email);
  await page.getByLabel("Mật khẩu (bắt buộc)", { exact: true }).fill(actor.password);
  await page.getByLabel("Nhập lại mật khẩu (bắt buộc)", { exact: true }).fill(actor.password);
  if (actor.phone) await page.getByLabel("Số điện thoại").fill(actor.phone);
  await page.getByRole("button", { name: actor.role === "TENANT" ? "Đăng ký tìm phòng" : "Đăng ký cho thuê" }).click();
  await expect(page).toHaveURL(/localhost:3100\/(?:\?.*)?$/);
  await revealResponsiveNavigation(page);
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}

export async function login(page: Page, actor: Rm054Actor | typeof rm054Admin): Promise<void> {
  await page.goto(actor.role === "ADMIN" ? "/admin/login" : "/login");
  await page.getByLabel("Email").fill(actor.email);
  await page.getByLabel("Mật khẩu (bắt buộc)", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(actor.role === "ADMIN" ? /localhost:3100\/admin$/ : /localhost:3100\/(?:\?.*)?$/);
  await revealResponsiveNavigation(page);
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await revealResponsiveNavigation(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/localhost:3100\/(?:\?.*)?$/);
  await revealResponsiveNavigation(page);
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
}

export async function expectNoJavascriptSessionToken(page: Page): Promise<void> {
  const browserVisibleAuth = await page.evaluate(() => ({
    cookie: document.cookie,
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage)
  }));
  expect(browserVisibleAuth.cookie).not.toContain("rentmate_session");
  expect(browserVisibleAuth.localKeys.join(" ")).not.toMatch(/token|jwt|rentmate_session/i);
  expect(browserVisibleAuth.sessionKeys.join(" ")).not.toMatch(/token|jwt|rentmate_session/i);
}

export async function createDraft(page: Page): Promise<number> {
  await page.goto("/landlord");
  await page
    .getByRole("heading", { name: "Tin của tôi" })
    .locator("xpath=../..")
    .getByRole("button", { name: "Tạo tin mới" })
    .click();
  await expect(page).toHaveURL(/\/landlord\/listings\/\d+$/);
  const matched = page.url().match(/\/landlord\/listings\/(\d+)$/);
  if (!matched?.[1]) throw new Error("RM-054 could not read the created listing id from the owner route.");
  return Number(matched[1]);
}

export async function completeDraft(
  page: Page,
  title: string,
  options: Readonly<{ useGeocode?: boolean }> = {}
): Promise<void> {
  await page.getByLabel("Tiêu đề").fill(title);
  await page
    .getByRole("textbox", { name: "Mô tả", exact: true })
    .fill("Mô tả thử nghiệm RM-054 đủ điều kiện gửi duyệt.");
  await page.getByLabel("Giá thuê mỗi tháng").fill("5200000");
  await page.getByLabel("Diện tích (m²)").fill("24");
  await page.getByLabel("Địa chỉ chính xác").fill("12 Đường RM054, Quận 1");
  await page.getByLabel("Tên khu vực").fill("Quận 1");
  await page.getByLabel("Loại phòng", { exact: true }).selectOption("ROOM");
  await page.getByLabel("Wi-Fi").check();

  if (options.useGeocode) {
    await page.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }).click();
    await page.getByRole("button", { name: /Chợ Bến Thành/ }).click();
  } else {
    await page.getByLabel("Vĩ độ").fill("10.7724");
    await page.getByLabel("Kinh độ").fill("106.6981");
  }

  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Đã lưu thay đổi.")).toBeVisible();
}

export async function uploadRoomImage(page: Page): Promise<void> {
  const input = page.getByLabel("Chọn một ảnh");
  await input.setInputFiles([]);
  await input.setInputFiles(roomImagePath);
  await page.getByRole("button", { name: "Tải ảnh lên" }).click();
  await expect(page.getByText(/Đã tải ảnh lên/)).toBeVisible();
}

export async function uploadProviderFailureImage(page: Page): Promise<void> {
  const input = page.getByLabel("Chọn một ảnh");
  await input.setInputFiles([]);
  await input.setInputFiles(providerFailureImagePath);
  await page.getByRole("button", { name: "Tải ảnh lên" }).click();
}

export async function submitDraft(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByText(/Trạng thái tin đăng: Chờ duyệt/)).toBeVisible();
}

export async function openAdminListing(page: Page, listingId: number): Promise<void> {
  await page.goto(`/admin/listings/${listingId}`);
  await expect(page.getByRole("heading", { name: `Tin #${listingId}` })).toBeVisible();
}

export async function moderate(
  page: Page,
  action: "Duyệt tin" | "Từ chối" | "Ẩn tin" | "Khôi phục",
  reason?: string
): Promise<void> {
  await page.getByRole("button", { name: action }).click();
  if (reason) await page.getByLabel("Lý do").fill(reason);
  await page.getByRole("button", { name: "Xác nhận hành động" }).click();
  await expect(page.getByText("Hành động kiểm duyệt đã được ghi nhận.")).toBeVisible();
}

export async function seedApprovedListing(page: Page): Promise<number> {
  const scenario = await resetRm054(page, "public");
  if (!scenario.listingId) throw new Error("RM-054 public seed did not return a listing id.");
  return scenario.listingId;
}

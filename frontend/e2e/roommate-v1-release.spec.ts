import { expect, test, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

const gatewayBaseUrl = "http://localhost:4001";
const frontendOrigin = "http://localhost:3000";
const password = "Roommate-E2E-2026";

interface ListingSummary {
  readonly id: number;
  readonly businessStatus: string;
  readonly maxOccupants: number | null;
  readonly title: string;
}

interface RoommateRequestDto {
  readonly id: number;
  readonly note: string | null;
}

interface RoommateInterestDto {
  readonly id: number;
  readonly status: string;
}

async function gateway(
  context: BrowserContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: object,
  expectedStatus?: number
): Promise<APIResponse> {
  const response = await context.request.fetch(`${gatewayBaseUrl}${path}`, {
    method,
    headers: { Origin: frontendOrigin },
    ...(body === undefined ? {} : { data: body })
  });
  if (expectedStatus === undefined) {
    expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  } else {
    expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(expectedStatus);
  }
  return response;
}

async function data<T>(response: APIResponse): Promise<T> {
  return (await response.json()).data as T;
}

async function registerTenant(context: BrowserContext, label: string, sequence: number): Promise<void> {
  const suffix = `${Date.now()}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
  await gateway(context, "POST", "/api/v1/auth/register/tenant", {
    displayName: `Roommate E2E ${label}`,
    email: `roommate-e2e-${suffix}@example.com`,
    password,
    phone: null
  });
}

async function completeProfile(context: BrowserContext, label: string): Promise<void> {
  await gateway(context, "PUT", "/api/v1/roommate-profiles/me", {
    intro: `Hồ sơ tự động cho kiểm thử Roommate V1 ${label}, chỉ mô tả thói quen sinh hoạt an toàn.`,
    sleepSchedule: "STANDARD",
    cleanlinessLevel: "BALANCED",
    noisePreference: "BALANCED",
    smokingEnvironment: "SMOKE_FREE",
    petEnvironment: "OK_WITH_PETS"
  });
}

function dateAfter(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function createRequest(
  context: BrowserContext,
  input: { readonly listingId: number | null; readonly areas: readonly string[]; readonly note: string }
): Promise<RoommateRequestDto> {
  return data<RoommateRequestDto>(
    await gateway(context, "POST", "/api/v1/roommate-requests", {
      listingId: input.listingId,
      preferredAreaKeys: input.areas,
      budgetMinPerPerson: 2_000_000,
      budgetMaxPerPerson: 12_000_000,
      moveInFrom: dateAfter(14),
      moveInUntil: dateAfter(45),
      note: input.note
    })
  );
}

async function createInterest(
  context: BrowserContext,
  requestId: number,
  message: string
): Promise<RoommateInterestDto> {
  return data<RoommateInterestDto>(
    await gateway(context, "POST", `/api/v1/roommate-requests/${requestId}/interests`, { message })
  );
}

async function findEligibleListing(context: BrowserContext): Promise<ListingSummary> {
  const response = await gateway(context, "GET", "/api/v1/listings?page=1&pageSize=50");
  const listings = ((await response.json()).data ?? []) as ListingSummary[];
  const listing = listings.find(
    (item) => item.businessStatus === "AVAILABLE" && item.maxOccupants !== null && item.maxOccupants >= 2
  );
  expect(listing, "The Gateway seed must expose an eligible public listing for Flow A.").toBeTruthy();
  return listing as ListingSummary;
}

async function expectRoommateShell(page: Page): Promise<void> {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator('nav[aria-label="Điều hướng ở ghép"]')).toBeVisible();
}

function captureHydrationDiagnostics(page: Page): string[] {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") diagnostics.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  return diagnostics;
}

function expectNoHydrationDiagnostics(diagnostics: readonly string[]): void {
  expect(
    diagnostics.filter((message) =>
      /hydration|hydrated|server rendered html|tree will be regenerated|react tree/iu.test(message)
    )
  ).toEqual([]);
}

async function hasStaticHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const position = window.getComputedStyle(element).position;
        return position !== "absolute" && position !== "fixed";
      })
      .filter((element) => {
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          if (
            (style.overflowX === "auto" || style.overflowX === "scroll") &&
            parent.scrollWidth > parent.clientWidth + 1
          ) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      })
      .some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
  );
}

test.describe.serial("ROOMMATE-V1-06 browser and Gateway release verification", () => {
  let ownerA: BrowserContext;
  let seekerA: BrowserContext;
  let ownerB: BrowserContext;
  let seekerB: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    const health = await fetch(`${gatewayBaseUrl}/api/health`);
    expect(health.ok, "The microservice Gateway must be running on port 4001.").toBe(true);
    [ownerA, seekerA, ownerB, seekerB] = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);
    await registerTenant(ownerA, "Flow A owner", 1);
    await registerTenant(seekerA, "Flow A seeker", 2);
    await registerTenant(ownerB, "Flow B owner", 3);
    await registerTenant(seekerB, "Flow B seeker", 4);
  });

  test.afterAll(async () => {
    await Promise.all([ownerA?.close(), seekerA?.close(), ownerB?.close(), seekerB?.close()]);
  });

  test("tenant authorization, profile requirement, listing CTA, and unavailable listing state", async ({ page }) => {
    await page.goto("/roommates");
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    const listing = await findEligibleListing(ownerA);
    const ownerPage = await ownerA.newPage();
    await ownerPage.goto(`/listings/${listing.id}`);
    const cta = ownerPage.getByRole("button", { name: /Tìm người ở ghép cho listing này/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(ownerPage).toHaveURL(/\/roommates\/profile\?next=/);
    await expect(ownerPage.locator('[name="intro"]')).toBeVisible();

    await completeProfile(ownerA, "Flow A owner");
    await ownerPage.goto(`/listings/${listing.id}`);
    await ownerPage.getByRole("button", { name: /Tìm người ở ghép cho listing này/i }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/roommates/my-request\\?listingId=${listing.id}$`));

    await completeProfile(ownerB, "Flow B owner");
    const unavailablePage = await ownerB.newPage();
    await unavailablePage.goto("/roommates/my-request?listingId=2147483647");
    await expect(unavailablePage.getByRole("alert")).toBeVisible();
  });

  test("Flow A: eligible listing to linked request, discovery, chat, accept, and connection", async () => {
    const listing = await findEligibleListing(ownerA);
    await completeProfile(seekerA, "Flow A seeker");
    const note = `FLOW-A-LINKED-${Date.now()}`;
    const initialMessage = `FLOW-A-INTEREST-${Date.now()}`;
    const chatMessage = `FLOW-A-CHAT-${Date.now()}`;
    const request = await createRequest(ownerA, { listingId: listing.id, areas: [], note });

    const seekerPage = await seekerA.newPage();
    await seekerPage.goto("/roommates");
    await expectRoommateShell(seekerPage);
    await expect(seekerPage.getByText(note, { exact: true })).toBeVisible();
    await expect(seekerPage.getByRole("heading", { name: listing.title, exact: true }).first()).toBeVisible();

    const interest = await createInterest(seekerA, request.id, initialMessage);
    await seekerPage.goto(`/roommates/conversations/${interest.id}`);
    await expect(seekerPage.getByText(initialMessage, { exact: true })).toBeVisible();
    await seekerPage.locator('[name="message"]').fill(chatMessage);
    await seekerPage.getByRole("button", { name: /Gửi tin nhắn/i }).click();
    await expect(seekerPage.getByText(chatMessage, { exact: true })).toBeVisible();
    await expect(seekerPage.getByText(/OTP/i).first()).toBeVisible();

    const ownerPage = await ownerA.newPage();
    await ownerPage.goto(`/roommates/interests?requestId=${request.id}`);
    await expect(ownerPage.getByText(initialMessage, { exact: true })).toBeVisible();
    await ownerPage.getByRole("button", { name: "Chấp nhận", exact: true }).click();
    await expect(ownerPage.getByRole("heading", { name: "Checklist an toàn", exact: true })).toBeVisible();
    await ownerPage.getByRole("button", { name: /Xác nhận chấp nhận/i }).click();
    await expect(ownerPage).toHaveURL(/\/roommates\/connection$/);
    await expectRoommateShell(ownerPage);
    await expect(ownerPage.getByRole("link", { name: /Mở trò chuyện/i })).toBeVisible();

    const seekerConnection = await data<{ interestId: number }>(
      await gateway(seekerA, "GET", "/api/v1/roommate-connections/current")
    );
    expect(seekerConnection.interestId).toBe(interest.id);
  });

  test("Flow B: unlinked request, filtered discovery, interest, accept, and connection", async () => {
    await completeProfile(seekerB, "Flow B seeker");
    const area = `Khu Flow B ${Date.now()}`;
    const note = `FLOW-B-UNLINKED-${Date.now()}`;
    const initialMessage = `FLOW-B-INTEREST-${Date.now()}`;
    const request = await createRequest(ownerB, { listingId: null, areas: [area], note });

    const seekerPage = await seekerB.newPage();
    await seekerPage.goto("/roommates");
    await seekerPage.locator('[name="area"]').fill(area);
    await seekerPage.locator('[name="listingMode"]').selectOption("UNLINKED");
    await seekerPage.getByRole("button", { name: /Lọc yêu cầu/i }).click();
    await expect(seekerPage.getByText(note, { exact: true })).toBeVisible();

    const interest = await createInterest(seekerB, request.id, initialMessage);
    const ownerPage = await ownerB.newPage();
    await ownerPage.goto(`/roommates/interests?requestId=${request.id}`);
    await expect(ownerPage.getByText(initialMessage, { exact: true })).toBeVisible();
    await gateway(ownerB, "POST", `/api/v1/roommate-interests/${interest.id}/accept`);
    await ownerPage.goto("/roommates/connection");
    await expectRoommateShell(ownerPage);
    await expect(ownerPage.getByRole("link", { name: /Mở trò chuyện/i })).toHaveAttribute(
      "href",
      `/roommates/conversations/${interest.id}`
    );

    const seekerConnection = await data<{ interestId: number }>(
      await gateway(seekerB, "GET", "/api/v1/roommate-connections/current")
    );
    expect(seekerConnection.interestId).toBe(interest.id);
  });

  test("safety report and pair block remain visible and effective through Gateway", async () => {
    const connection = await data<{ interestId: number }>(
      await gateway(seekerB, "GET", "/api/v1/roommate-connections/current")
    );
    const page = await seekerB.newPage();
    await page.goto("/roommates/connection");
    await expect(page.getByRole("heading", { name: "Checklist an toàn", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Báo cáo", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Chặn/i })).toBeVisible();

    await gateway(seekerB, "POST", `/api/v1/roommate-interests/${connection.interestId}/reports`, {
      category: "SPAM",
      details: "Roommate V1 release E2E safety verification."
    });
    const blocked = await data<{ blocked: boolean }>(
      await gateway(seekerB, "PUT", `/api/v1/roommate-interests/${connection.interestId}/block`)
    );
    expect(blocked.blocked).toBe(true);
    await gateway(seekerB, "GET", "/api/v1/roommate-connections/current", undefined, 404);
    await gateway(ownerB, "GET", "/api/v1/roommate-connections/current", undefined, 404);

    await page.reload();
    await expect(page.getByRole("link", { name: /Khám phá yêu cầu/i })).toBeVisible();
  });

  test("representative responsive layouts remain usable", async () => {
    const page = await ownerA.newPage();
    const hydrationDiagnostics = captureHydrationDiagnostics(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/roommates/connection");
    await expectRoommateShell(page);
    await expect(page.getByRole("link", { name: /Mở trò chuyện/i })).toBeVisible();
    expect(await hasStaticHorizontalOverflow(page)).toBe(false);

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/roommates/connection");
      await expectRoommateShell(page);
      await expect(page.locator('a[href^="/roommates/conversations/"]').first()).toBeVisible();
      expect(await hasStaticHorizontalOverflow(page)).toBe(false);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/roommates");
    await expectRoommateShell(page);
    await expect(page.locator('[name="listingMode"]')).toBeVisible();
    expect(await hasStaticHorizontalOverflow(page)).toBe(false);
    expectNoHydrationDiagnostics(hydrationDiagnostics);
  });
});

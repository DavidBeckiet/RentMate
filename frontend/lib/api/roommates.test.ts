import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { createRoommateApi } from "./roommates";

function transport(): {
  readonly client: ApiTransport;
  readonly object: ReturnType<typeof vi.fn>;
  readonly page: ReturnType<typeof vi.fn>;
  readonly empty: ReturnType<typeof vi.fn>;
} {
  const object = vi.fn();
  const page = vi.fn();
  const empty = vi.fn();
  return {
    client: { raw: vi.fn(), object, page, void: empty } as unknown as ApiTransport,
    object,
    page,
    empty
  };
}

describe("createRoommateApi", () => {
  it("uses the shared cookie transport for profile, request, discovery, and interest routes", () => {
    const mock = transport();
    const api = createRoommateApi(mock.client);
    const profile = {
      intro: "Mình ưu tiên không gian gọn gàng và tôn trọng nhau.",
      sleepSchedule: "STANDARD" as const,
      cleanlinessLevel: "BALANCED" as const,
      noisePreference: "BALANCED" as const,
      smokingEnvironment: "NO_PREFERENCE" as const,
      petEnvironment: "OK_WITH_PETS" as const
    };

    void api.getProfile();
    void api.getAiCapabilities();
    void api.createPreferencePreview({
      target: "PROFILE",
      text: "Mình thích nhà yên tĩnh và không hút thuốc.",
      locale: "vi"
    });
    void api.upsertProfile(profile);
    void api.createRequest({
      listingId: null,
      preferredAreaKeys: ["Quận 3"],
      budgetMinPerPerson: 3_000_000,
      budgetMaxPerPerson: 5_000_000,
      moveInFrom: "2026-09-01",
      moveInUntil: "2026-09-30",
      note: null
    });
    void api.discover({ area: "Quận 3", listingMode: "UNLINKED", page: 2, pageSize: 12 });
    void api.createInterest(42, "Mình muốn tìm hiểu thêm về nhu cầu ở ghép của bạn.");

    expect(mock.object).toHaveBeenNthCalledWith(1, "/api/v1/roommate-profiles/me", { signal: undefined });
    expect(mock.object).toHaveBeenNthCalledWith(2, "/api/v1/roommate-ai/capabilities", { signal: undefined });
    expect(mock.object).toHaveBeenNthCalledWith(3, "/api/v1/roommate-ai/preference-previews", {
      method: "POST",
      json: { target: "PROFILE", text: "Mình thích nhà yên tĩnh và không hút thuốc.", locale: "vi" },
      signal: undefined
    });
    expect(mock.object).toHaveBeenNthCalledWith(4, "/api/v1/roommate-profiles/me", {
      method: "PUT",
      json: profile,
      signal: undefined
    });
    expect(mock.object).toHaveBeenNthCalledWith(5, "/api/v1/roommate-requests", {
      method: "POST",
      json: expect.objectContaining({ listingId: null, preferredAreaKeys: ["Quận 3"] }),
      signal: undefined
    });
    expect(mock.page).toHaveBeenNthCalledWith(1, "/api/v1/roommate-requests", {
      query: { area: "Quận 3", listingMode: "UNLINKED", page: 2, pageSize: 12 },
      signal: undefined
    });
    expect(mock.object).toHaveBeenNthCalledWith(6, "/api/v1/roommate-requests/42/interests", {
      method: "POST",
      json: { message: "Mình muốn tìm hiểu thêm về nhu cầu ở ghép của bạn." },
      signal: undefined
    });
  });

  it("keeps message, block, report, and admin moderation routes under the API gateway namespace", () => {
    const mock = transport();
    const api = createRoommateApi(mock.client);

    void api.listMessages(7, { page: 1, pageSize: 50 });
    void api.sendMessage(7, "Chào bạn");
    void api.markMessagesRead(7);
    void api.blockRequest(8);
    void api.listOwnedBlocks({ page: 2, pageSize: 10 });
    void api.reportRequest(8, { targetType: "ROOMMATE_REQUEST", category: "FRAUD", details: null });
    void api.listAdminReports({ status: "OPEN", category: "FRAUD", reviewPriority: "ELEVATED" });
    void api.moderateProfile(7, { state: "HIDDEN", reportId: 12, note: "Đã xem xét." });
    void api.moderateRequest(8, { state: "HIDDEN", reportId: 12, note: "Đã xem xét." });

    expect(mock.page).toHaveBeenCalledWith("/api/v1/roommate-interests/7/messages", {
      query: { page: 1, pageSize: 50 },
      signal: undefined
    });
    expect(mock.object).toHaveBeenCalledWith("/api/v1/roommate-interests/7/messages", {
      method: "POST",
      json: { body: "Chào bạn" },
      signal: undefined
    });
    expect(mock.empty).toHaveBeenCalledWith("/api/v1/roommate-interests/7/read", { method: "POST", signal: undefined });
    expect(mock.object).toHaveBeenCalledWith("/api/v1/roommate-requests/8/block", { method: "PUT", signal: undefined });
    expect(mock.page).toHaveBeenCalledWith("/api/v1/roommate-blocks/mine", {
      query: { page: 2, pageSize: 10 },
      signal: undefined
    });
    expect(mock.object).toHaveBeenCalledWith("/api/v1/roommate-requests/8/reports", {
      method: "POST",
      json: { targetType: "ROOMMATE_REQUEST", category: "FRAUD", details: null },
      signal: undefined
    });
    expect(mock.page).toHaveBeenCalledWith("/api/v1/admin/contact-reports", {
      query: { source: "ROOMMATE", status: "OPEN", category: "FRAUD", reviewPriority: "ELEVATED" },
      signal: undefined
    });
    expect(mock.object).toHaveBeenCalledWith("/api/v1/admin/roommate-profiles/7/moderation", {
      method: "PATCH",
      json: { state: "HIDDEN", reportId: 12, note: "Đã xem xét." },
      signal: undefined
    });
    expect(mock.object).toHaveBeenCalledWith("/api/v1/admin/roommate-requests/8/moderation", {
      method: "PATCH",
      json: { state: "HIDDEN", reportId: 12, note: "Đã xem xét." },
      signal: undefined
    });
  });
});

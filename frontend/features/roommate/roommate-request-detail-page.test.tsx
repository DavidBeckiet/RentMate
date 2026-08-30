import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateInterest, roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  listMine: vi.fn(),
  getProfile: vi.fn(),
  createInterest: vi.fn(),
  getAiCapabilities: vi.fn(),
  createAiExplanation: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates/requests/42", useRouter: () => routerMocks }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { RoommateRequestDetailPage } from "./roommate-request-detail-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

function emptyPage() {
  return { data: [], pagination: { page: 1, pageSize: 50, hasNextPage: false } };
}

describe("RoommateRequestDetailPage", () => {
  beforeEach(() => {
    apiMocks.getRequest.mockReset();
    apiMocks.listMine.mockReset();
    apiMocks.getProfile.mockReset();
    apiMocks.createInterest.mockReset();
    apiMocks.getAiCapabilities.mockReset();
    apiMocks.createAiExplanation.mockReset();
    routerMocks.push.mockReset();
    useAuthMock.mockReturnValue(auth());
    apiMocks.listMine.mockResolvedValue(emptyPage());
    apiMocks.getProfile.mockResolvedValue(roommateProfile());
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: false,
      compatibilityExplanations: false,
      safetyWarnings: false
    });
  });

  it("renders public-safe request context, the required warning, checklist, and an interest composer", async () => {
    apiMocks.getRequest.mockResolvedValue(roommateRequest());
    apiMocks.createInterest.mockResolvedValue(roommateInterest({ id: 91, direction: "OUTGOING" }));
    render(<RoommateRequestDetailPage requestId="42" />);

    expect(await screen.findByRole("heading", { name: "Chi tiết yêu cầu ở ghép" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Báo cáo và ngừng tương tác nếu thấy hành vi đáng ngờ.")).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/106\.682|10\.782/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Lời nhắn mở đầu (bắt buộc)"), {
      target: { value: "Mình muốn trao đổi thêm về nhu cầu ở ghép." }
    });
    expect(
      screen.getByText(`${Array.from("Mình muốn trao đổi thêm về nhu cầu ở ghép.").length}/2000 ký tự`)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi lời quan tâm" }));
    await waitFor(() =>
      expect(apiMocks.createInterest).toHaveBeenCalledWith(42, "Mình muốn trao đổi thêm về nhu cầu ở ghép.")
    );
    expect(routerMocks.push).toHaveBeenCalledWith("/roommates/conversations/91");
  });

  it("does not offer a new interest when a linked request is no longer available", async () => {
    apiMocks.getRequest.mockResolvedValue(
      roommateRequest({
        listingId: 23,
        listingMode: "LINKED",
        signals: { profileCompleted: true, requestOpen: true, listingCurrentlyAvailable: false }
      })
    );
    render(<RoommateRequestDetailPage requestId="42" />);
    expect(await screen.findByText("Listing không còn khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi lời quan tâm" })).not.toBeInTheDocument();
  });

  it("renders the full backend compatibility breakdown in frozen dimension order", async () => {
    apiMocks.getRequest.mockResolvedValue(
      roommateRequest({
        compatibility: {
          rulesVersion: "ROOMMATE_COMPAT_V2_1",
          category: null,
          evaluatedCount: 1,
          dimensions: [
            { dimension: "MOVE_IN", outcome: "ALIGNED", explanationCode: "MOVE_IN_ALIGNED_OVERLAP" },
            { dimension: "AREA", outcome: "NOT_EVALUATED", explanationCode: "AREA_NOT_EVALUATED" },
            { dimension: "PETS", outcome: "NOT_EVALUATED", explanationCode: "PETS_NOT_EVALUATED" },
            { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
            { dimension: "SMOKING", outcome: "NOT_EVALUATED", explanationCode: "SMOKING_NOT_EVALUATED" },
            { dimension: "NOISE", outcome: "NOT_EVALUATED", explanationCode: "NOISE_NOT_EVALUATED" },
            { dimension: "CLEANLINESS", outcome: "NOT_EVALUATED", explanationCode: "CLEANLINESS_NOT_EVALUATED" },
            { dimension: "SLEEP", outcome: "NOT_EVALUATED", explanationCode: "SLEEP_NOT_EVALUATED" }
          ]
        }
      })
    );
    render(<RoommateRequestDetailPage requestId="42" />);
    const list = await screen.findByRole("list", { name: "Tất cả khía cạnh tương thích" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("span")?.textContent)
    ).toEqual([
      "Nhịp sinh hoạt",
      "Mức độ gọn gàng",
      "Ưu tiên không gian",
      "Môi trường thuốc lá",
      "Thú cưng",
      "Ngân sách",
      "Khu vực",
      "Thời gian chuyển vào"
    ]);
    expect(within(list).getAllByText("Chưa đủ thông tin").length).toBeGreaterThan(0);
  });

  it("guides a tenant without a roommate profile before posting an interest", async () => {
    apiMocks.getRequest.mockResolvedValue(roommateRequest());
    apiMocks.getProfile.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    render(<RoommateRequestDetailPage requestId="42" />);

    expect(
      await screen.findByRole("heading", { name: "Hoàn thành hồ sơ trước khi gửi lời quan tâm" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết lập hồ sơ ở ghép" })).toHaveAttribute(
      "href",
      "/roommates/profile?next=/roommates/requests/42"
    );
    expect(screen.queryByRole("button", { name: "Gửi lời quan tâm" })).not.toBeInTheDocument();
    expect(apiMocks.createInterest).not.toHaveBeenCalled();
  });

  it("shows the explicit AI explanation action only for valid V2 evidence and keeps V2 facts visible", async () => {
    const compatibility = {
      rulesVersion: "ROOMMATE_COMPAT_V2_1" as const,
      category: "MIXED" as const,
      evaluatedCount: 8,
      dimensions: [
        {
          dimension: "SLEEP" as const,
          outcome: "DISCUSS" as const,
          explanationCode: "SLEEP_DISCUSS_DIFFERENT" as const
        },
        {
          dimension: "CLEANLINESS" as const,
          outcome: "ALIGNED" as const,
          explanationCode: "CLEANLINESS_ALIGNED_SAME" as const
        },
        { dimension: "NOISE" as const, outcome: "ALIGNED" as const, explanationCode: "NOISE_ALIGNED_SAME" as const },
        {
          dimension: "SMOKING" as const,
          outcome: "ALIGNED" as const,
          explanationCode: "SMOKING_ALIGNED_SAME" as const
        },
        { dimension: "PETS" as const, outcome: "ALIGNED" as const, explanationCode: "PETS_ALIGNED_SAME" as const },
        {
          dimension: "BUDGET" as const,
          outcome: "ALIGNED" as const,
          explanationCode: "BUDGET_ALIGNED_OVERLAP" as const
        },
        { dimension: "AREA" as const, outcome: "ALIGNED" as const, explanationCode: "AREA_ALIGNED_OVERLAP" as const },
        {
          dimension: "MOVE_IN" as const,
          outcome: "ALIGNED" as const,
          explanationCode: "MOVE_IN_ALIGNED_OVERLAP" as const
        }
      ]
    };
    apiMocks.getRequest.mockResolvedValue(roommateRequest({ compatibility }));
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: false,
      compatibilityExplanations: true,
      safetyWarnings: false
    });
    apiMocks.createAiExplanation.mockResolvedValue({
      summary: "Hai bên có nhiều điểm đã được xác định, đồng thời nên trao đổi thêm về nhịp sinh hoạt.",
      evidenceRefs: [{ dimension: "SLEEP", explanationCode: "SLEEP_DISCUSS_DIFFERENT" }],
      cautions: [{ dimension: "SLEEP", text: "Nên trao đổi trước về giờ nghỉ ngơi." }],
      rulesVersion: "ROOMMATE_COMPAT_V2_1",
      explanationVersion: "ROOMMATE_AI_EXPLANATION_V3_1",
      promptVersion: "ROOMMATE_AI_EXPLANATION_PROMPT_V1",
      generatedAt: "2026-08-28T12:00:00.000Z"
    });
    render(<RoommateRequestDetailPage requestId="42" />);
    const action = await screen.findByRole("button", { name: "Giải thích bằng AI" });
    expect(apiMocks.createAiExplanation).not.toHaveBeenCalled();
    fireEvent.click(action);
    await waitFor(() => expect(apiMocks.createAiExplanation).toHaveBeenCalledWith(42, { locale: "vi" }));
    expect(await screen.findByRole("heading", { name: "Giải thích do AI hỗ trợ" })).toBeInTheDocument();
    expect(screen.getByText("Điểm nên trao đổi")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Tất cả khía cạnh tương thích" })).toBeInTheDocument();
  });

  it("reconciles a null AI response without a provider-failure UI or stale explanation", async () => {
    const compatibility = {
      rulesVersion: "ROOMMATE_COMPAT_V2_1" as const,
      category: null,
      evaluatedCount: 1,
      dimensions: [
        {
          dimension: "SLEEP" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "SLEEP_NOT_EVALUATED" as const
        },
        {
          dimension: "CLEANLINESS" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "CLEANLINESS_NOT_EVALUATED" as const
        },
        {
          dimension: "NOISE" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "NOISE_NOT_EVALUATED" as const
        },
        {
          dimension: "SMOKING" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "SMOKING_NOT_EVALUATED" as const
        },
        {
          dimension: "PETS" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "PETS_NOT_EVALUATED" as const
        },
        {
          dimension: "BUDGET" as const,
          outcome: "ALIGNED" as const,
          explanationCode: "BUDGET_ALIGNED_OVERLAP" as const
        },
        {
          dimension: "AREA" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "AREA_NOT_EVALUATED" as const
        },
        {
          dimension: "MOVE_IN" as const,
          outcome: "NOT_EVALUATED" as const,
          explanationCode: "MOVE_IN_NOT_EVALUATED" as const
        }
      ]
    };
    apiMocks.getRequest
      .mockResolvedValueOnce(roommateRequest({ compatibility }))
      .mockResolvedValueOnce(roommateRequest({ compatibility: null }));
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: false,
      compatibilityExplanations: true,
      safetyWarnings: false
    });
    apiMocks.createAiExplanation.mockResolvedValue(null);
    render(<RoommateRequestDetailPage requestId="42" />);
    fireEvent.click(await screen.findByRole("button", { name: "Giải thích bằng AI" }));
    await waitFor(() => expect(apiMocks.getRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/nhà cung cấp|provider|Gemini/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Giải thích do AI hỗ trợ" })).not.toBeInTheDocument();
    expect(screen.getByText("Chưa đủ dữ liệu để tổng hợp các điểm cần trao đổi.")).toBeInTheDocument();
  });
});

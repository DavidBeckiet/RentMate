import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ discover: vi.fn(), getAiCapabilities: vi.fn(), getAiRecommendations: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigationMocks = vi.hoisted(() => ({ push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/roommates",
  useRouter: () => ({ push: navigationMocks.push }),
  useSearchParams: () => new URLSearchParams(navigationMocks.search)
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { parseDiscoveryUrlState, RoommateDiscoveryPage } from "./roommate-discovery-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateDiscoveryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.search = "";
    useAuthMock.mockReturnValue(auth());
    apiMocks.discover.mockResolvedValue({
      data: [roommateRequest()],
      pagination: { page: 1, pageSize: 8, hasNextPage: false }
    });
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: false,
      compatibilityExplanations: false,
      safetyWarnings: false
    });
  });

  it("keeps public-safe discovery cards compact and free of technical listing wording", async () => {
    render(<RoommateDiscoveryPage />);
    expect(await screen.findByRole("heading", { name: "Bạn cùng phòng" })).toBeInTheDocument();
    expect(screen.getAllByText("Cùng tìm phòng phù hợp")).toHaveLength(2);
    expect(screen.getByText("Chưa chọn phòng cụ thể")).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/106\.682|10\.782/)).not.toBeInTheDocument();
    expect(screen.queryByText(/V1 \+ V2/)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Phân trang yêu cầu ở ghép" })).not.toBeInTheDocument();
  });

  it("writes applied filters and pagination to the URL while keeping draft input separate", async () => {
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });
    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "binh thanh" } });
    fireEvent.change(screen.getByLabelText("Hình thức tìm phòng"), { target: { value: "UNLINKED" } });
    fireEvent.click(screen.getByRole("button", { name: "Lọc yêu cầu" }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith(
      "/roommates?area=B%C3%ACnh+Th%E1%BA%A1nh&listingMode=UNLINKED"
    );
  });

  it("uses at most three factual compatibility highlights and compact Vietnamese verification", async () => {
    apiMocks.discover.mockResolvedValue({
      data: [
        roommateRequest({
          profile: roommateProfile({ emailVerified: true, phoneVerified: true }),
          compatibility: {
            rulesVersion: "ROOMMATE_COMPAT_V2_1",
            category: "HIGH_ALIGNMENT",
            evaluatedCount: 4,
            dimensions: [
              { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
              { dimension: "AREA", outcome: "ALIGNED", explanationCode: "AREA_ALIGNED_OVERLAP" },
              { dimension: "MOVE_IN", outcome: "ALIGNED", explanationCode: "MOVE_IN_ALIGNED_OVERLAP" },
              { dimension: "NOISE", outcome: "ALIGNED", explanationCode: "NOISE_ALIGNED_SAME" }
            ]
          }
        })
      ],
      pagination: { page: 1, pageSize: 8, hasNextPage: false }
    });
    render(<RoommateDiscoveryPage />);
    expect(await screen.findByText("Đã xác minh")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Khung ngân sách có giao nhau\.|Khu vực quan tâm có phần giao nhau\.|Khoảng thời gian chuyển vào có phần giao nhau\.|Ưu tiên không gian được mô tả tương đồng\./
      )
    ).toHaveLength(3);
  });

  it("keeps AI suggestions separate and uses neutral failure copy", async () => {
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: true,
      compatibilityExplanations: false,
      safetyWarnings: false
    });
    apiMocks.getAiRecommendations.mockRejectedValue(new Error("provider unavailable"));
    render(<RoommateDiscoveryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Gợi ý cho tôi" }));
    expect(await screen.findByText("Hiện chưa thể tạo gợi ý AI")).toBeInTheDocument();
    expect(screen.getByText("Bạn vẫn có thể tiếp tục xem danh sách bên dưới.")).toBeInTheDocument();
  });
});

describe("parseDiscoveryUrlState", () => {
  it("normalizes valid URL state and safely drops invalid date and budget pairs", () => {
    expect(
      parseDiscoveryUrlState(
        new URLSearchParams(
          "area=Q3&moveInFrom=2026-10-10&moveInUntil=2026-09-10&budgetMinPerPerson=9&budgetMaxPerPerson=3&page=2"
        )
      )
    ).toMatchObject({
      form: {
        area: "Quận 3",
        moveInFrom: "",
        moveInUntil: "",
        budgetMinPerPerson: "",
        budgetMaxPerPerson: "",
        listingMode: "ALL"
      },
      page: 2
    });
  });
});

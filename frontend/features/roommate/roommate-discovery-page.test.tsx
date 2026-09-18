import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateInterest, roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({
  discover: vi.fn(),
  getAiCapabilities: vi.fn(),
  getAiRecommendations: vi.fn(),
  getProfile: vi.fn(),
  listMine: vi.fn(),
  listInterests: vi.fn()
}));
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
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
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
    apiMocks.getProfile.mockResolvedValue(roommateProfile());
    apiMocks.listMine.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 1, hasNextPage: false } });
    apiMocks.listInterests.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 1, hasNextPage: false } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows one contextual next step and prioritizes a pending incoming interest", async () => {
    apiMocks.listMine.mockResolvedValue({
      data: [roommateRequest()],
      pagination: { page: 1, pageSize: 1, hasNextPage: false }
    });
    apiMocks.listInterests.mockResolvedValue({
      data: [roommateInterest()],
      pagination: { page: 1, pageSize: 1, hasNextPage: true }
    });
    render(<RoommateDiscoveryPage />);

    expect(await screen.findByRole("link", { name: "Xem lời quan tâm" })).toHaveAttribute(
      "href",
      "/roommates/interests"
    );
    expect(screen.queryByText("Dành cho bạn")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cập nhật yêu cầu" })).not.toBeInTheDocument();
    expect(apiMocks.listInterests).toHaveBeenCalledWith(
      { direction: "INCOMING", status: "PENDING", page: 1, pageSize: 1 },
      expect.any(AbortSignal)
    );
  });

  it("directs tenants with an incomplete profile to profile setup", async () => {
    apiMocks.getProfile.mockResolvedValue(roommateProfile({ profileCompleted: false }));
    apiMocks.listInterests.mockResolvedValue({
      data: [roommateInterest()],
      pagination: { page: 1, pageSize: 1, hasNextPage: false }
    });
    render(<RoommateDiscoveryPage />);

    expect(await screen.findByRole("link", { name: "Hoàn thiện hồ sơ" })).toHaveAttribute("href", "/roommates/profile");
    expect(screen.queryByRole("link", { name: "Xem lời quan tâm" })).not.toBeInTheDocument();
  });

  it("offers request creation when there is no pending next step", async () => {
    render(<RoommateDiscoveryPage />);

    const actions = await screen.findAllByRole("link", { name: "Đăng nhu cầu" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveAttribute("href", "/roommates/my-request");
  });

  it("removes only the selected applied filter and returns to page one", async () => {
    navigationMocks.search = "area=Q3&budgetMinPerPerson=2000000&listingMode=UNLINKED&page=3";
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc: Quận 3" }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith(
      "/roommates?budgetMinPerPerson=2000000&listingMode=UNLINKED",
      { scroll: false }
    );
    expect(screen.getByLabelText("Khu vực")).toHaveValue("");
  });

  it("keeps applied chips separate from drafts and restores filters on browser navigation", async () => {
    navigationMocks.search = "area=Q3";
    const view = render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });
    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Bình Thạnh" } });
    expect(screen.getByRole("button", { name: "Bỏ lọc: Quận 3" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bỏ lọc: Bình Thạnh" })).not.toBeInTheDocument();
    navigationMocks.search = "budgetMaxPerPerson=5000000";
    view.rerender(<RoommateDiscoveryPage />);
    expect(screen.getByLabelText("Khu vực")).toHaveValue("");
    expect(screen.getByLabelText("Đến", { exact: true })).toHaveValue(5000000);
  });

  it("keeps public-safe discovery cards compact and free of technical listing wording", async () => {
    render(<RoommateDiscoveryPage />);
    expect(await screen.findByRole("heading", { name: "Bạn cùng phòng" })).toBeInTheDocument();
    expect(apiMocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 6, page: 1 }),
      expect.any(AbortSignal)
    );
    expect(screen.getAllByText("Cùng tìm phòng phù hợp")).toHaveLength(2);
    expect(screen.queryByText("Chưa chọn phòng cụ thể")).not.toBeInTheDocument();
    expect(screen.getByText("Chuyển vào")).toBeInTheDocument();
    expect(screen.queryByText(/Thành viên từ|Mở từ|Lời nhắn từ người đăng/)).not.toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/106\.682|10\.782/)).not.toBeInTheDocument();
    expect(screen.queryByText(/V1 \+ V2/)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Phân trang người đang tìm ở ghép" })).not.toBeInTheDocument();
  });

  it("writes applied filters and pagination to the URL while keeping draft input separate", async () => {
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "binh thanh" } });
    fireEvent.change(screen.getByLabelText("Hình thức tìm phòng"), { target: { value: "UNLINKED" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem kết quả" }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith(
      "/roommates?area=B%C3%ACnh+Th%E1%BA%A1nh&listingMode=UNLINKED",
      { scroll: false }
    );
  });

  it("switches discovery mode directly from the profile directory", async () => {
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });

    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Quận 7" } });
    fireEvent.click(screen.getByRole("button", { name: "Đã có phòng" }));

    expect(navigationMocks.push).toHaveBeenLastCalledWith("/roommates?listingMode=LINKED", { scroll: false });
  });

  it("keeps optional filters collapsed and resets draft filters", async () => {
    const { rerender } = render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    const budget = screen.getByLabelText("Nhập ngân sách chính xác").closest("details");
    const dates = screen.getByText("Bộ lọc thêm").closest("details");
    expect(budget).not.toHaveAttribute("open");
    expect(dates).not.toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("Ngân sách tối thiểu"), { target: { value: "2000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem kết quả" }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith("/roommates?budgetMinPerPerson=2000000", { scroll: false });
    navigationMocks.search = "budgetMinPerPerson=2000000";
    rerender(<RoommateDiscoveryPage />);
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith("/roommates", { scroll: false });
    expect(screen.getByLabelText("Ngân sách tối thiểu")).toHaveValue("0");
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc" })).not.toBeInTheDocument();
  });

  it("shows date filters applied from the URL and preserves exact budget entry", async () => {
    navigationMocks.search = "moveInFrom=2026-10-01";
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc (1)" }));
    expect(screen.getByText("Bộ lọc thêm · Có lọc ngày").closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("2026-10-01");
    fireEvent.click(screen.getByLabelText("Nhập ngân sách chính xác"));
    expect(screen.getByLabelText("Nhập ngân sách chính xác").closest("details")).toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("Từ", { exact: true }), { target: { value: "2350000" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem kết quả" }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith(
      "/roommates?budgetMinPerPerson=2350000&moveInFrom=2026-10-01",
      { scroll: false }
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

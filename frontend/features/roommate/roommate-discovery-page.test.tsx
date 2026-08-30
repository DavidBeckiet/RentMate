import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ discover: vi.fn(), getAiCapabilities: vi.fn(), getAiRecommendations: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates" }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { RoommateDiscoveryPage } from "./roommate-discovery-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateDiscoveryPage", () => {
  beforeEach(() => {
    apiMocks.discover.mockReset();
    apiMocks.getAiCapabilities.mockReset();
    apiMocks.getAiRecommendations.mockReset();
    useAuthMock.mockReturnValue(auth());
    apiMocks.discover.mockResolvedValue({
      data: [roommateRequest()],
      pagination: { page: 1, pageSize: 12, hasNextPage: false }
    });
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: false,
      compatibilityExplanations: false,
      safetyWarnings: false
    });
  });

  it("loads public-safe discovery cards and applies explicit filters", async () => {
    render(<RoommateDiscoveryPage />);
    expect(await screen.findByRole("heading", { name: "Bạn cùng phòng" })).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/106\.682|10\.782/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Quận 3" } });
    fireEvent.change(screen.getByLabelText("Bối cảnh listing"), { target: { value: "UNLINKED" } });
    fireEvent.click(screen.getByRole("button", { name: "Lọc yêu cầu" }));
    await waitFor(() =>
      expect(apiMocks.discover).toHaveBeenLastCalledWith(
        expect.objectContaining({ area: "Quận 3", listingMode: "UNLINKED" }),
        expect.any(AbortSignal)
      )
    );
  });

  it("clears submitted discovery filters explicitly", async () => {
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });

    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Quận 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Lọc yêu cầu" }));
    await waitFor(() =>
      expect(apiMocks.discover).toHaveBeenLastCalledWith(
        expect.objectContaining({ area: "Quận 3" }),
        expect.any(AbortSignal)
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() =>
      expect(apiMocks.discover).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ area: expect.anything() }),
        expect.any(AbortSignal)
      )
    );
  });

  it("renders backend compatibility highlights and factual public badges without contact values", async () => {
    apiMocks.discover.mockResolvedValue({
      data: [
        roommateRequest({
          profile: roommateProfile({ emailVerified: true, phoneVerified: true }),
          compatibility: {
            rulesVersion: "ROOMMATE_COMPAT_V2_1",
            category: "HIGH_ALIGNMENT",
            evaluatedCount: 3,
            dimensions: [
              { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
              { dimension: "AREA", outcome: "NOT_EVALUATED", explanationCode: "AREA_NOT_EVALUATED" },
              { dimension: "MOVE_IN", outcome: "ALIGNED", explanationCode: "MOVE_IN_ALIGNED_OVERLAP" }
            ]
          }
        })
      ],
      pagination: { page: 1, pageSize: 12, hasNextPage: false }
    });
    render(<RoommateDiscoveryPage />);

    expect(await screen.findByText("Nhiều điểm phù hợp")).toBeInTheDocument();
    expect(screen.getByText("Khung ngân sách có giao nhau.")).toBeInTheDocument();
    expect(screen.getByText("Email đã xác minh")).toBeInTheDocument();
    expect(screen.getByText("Số điện thoại đã xác minh")).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
  });

  it("keeps AI suggestions separate, labels curated reasons, and dismisses only local items", async () => {
    apiMocks.getAiCapabilities.mockResolvedValue({
      preferenceParsing: false,
      semanticRecommendations: true,
      compatibilityExplanations: false,
      safetyWarnings: false
    });
    apiMocks.getAiRecommendations.mockResolvedValue({
      items: [
        {
          request: roommateRequest(),
          recommendation: {
            reasonCodes: ["SEMANTIC_NOISE_ALIGNED", "V2_BUDGET_ALIGNED"],
            semanticRulesVersion: "ROOMMATE_AI_SEMANTIC_V3_1"
          }
        }
      ],
      candidateWindowSize: 1,
      reason: null,
      generatedAt: "2026-08-28T12:00:00.000Z"
    });
    render(<RoommateDiscoveryPage />);
    const open = await screen.findByRole("button", { name: "Xem gợi ý AI" });
    fireEvent.click(open);
    expect(await screen.findByText("Có tín hiệu phù hợp về không gian sinh hoạt.")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn trong phiên này" }));
    expect(screen.queryByText("Có tín hiệu phù hợp về không gian sinh hoạt.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bạn cùng phòng" })).toBeInTheDocument();
  });
});

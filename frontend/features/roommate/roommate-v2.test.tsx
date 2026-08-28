import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoommateCompatibility, RoommateProfile } from "../../types/api";
import {
  RoommateCompatibilitySummary,
  RoommateVerificationBadges,
  selectRoommateCompatibilityHighlights
} from "./roommate-v2";

const compatibility: RoommateCompatibility = {
  rulesVersion: "ROOMMATE_COMPAT_V2_1",
  category: "IMPORTANT_DIFFERENCE",
  evaluatedCount: 5,
  dimensions: [
    { dimension: "SLEEP", outcome: "NOT_EVALUATED", explanationCode: "SLEEP_NOT_EVALUATED" },
    { dimension: "CLEANLINESS", outcome: "ALIGNED", explanationCode: "CLEANLINESS_ALIGNED_SAME" },
    { dimension: "NOISE", outcome: "DISCUSS", explanationCode: "NOISE_DISCUSS_DIFFERENT" },
    {
      dimension: "SMOKING",
      outcome: "IMPORTANT_DIFFERENCE",
      explanationCode: "SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR"
    },
    { dimension: "PETS", outcome: "NEUTRAL", explanationCode: "PETS_NEUTRAL_OK_WITH_PETS" },
    { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
    { dimension: "AREA", outcome: "NOT_EVALUATED", explanationCode: "AREA_NOT_EVALUATED" },
    { dimension: "MOVE_IN", outcome: "ALIGNED", explanationCode: "MOVE_IN_ALIGNED_OVERLAP" }
  ]
};

const profile: RoommateProfile = {
  intro: "Mình thích trao đổi rõ ràng và tôn trọng không gian chung.",
  sleepSchedule: "STANDARD",
  cleanlinessLevel: "BALANCED",
  noisePreference: "QUIET",
  smokingEnvironment: "SMOKE_FREE",
  petEnvironment: "OK_WITH_PETS",
  displayName: "Minh",
  memberSince: "2025-10-01T00:00:00.000Z",
  emailVerified: true,
  phoneVerified: false,
  profileCompleted: true
};

describe("Roommate V2 presentational contracts", () => {
  it("selects at most three backend dimensions with important differences first", () => {
    const highlights = selectRoommateCompatibilityHighlights(compatibility.dimensions);
    expect(highlights).toHaveLength(3);
    expect(highlights.map((item) => item.dimension)).toEqual(["SMOKING", "BUDGET", "MOVE_IN"]);
    expect(highlights.some((item) => item.outcome === "NOT_EVALUATED")).toBe(false);
  });

  it("renders a compact neutral summary without exposing a numeric score", () => {
    render(<RoommateCompatibilitySummary compatibility={compatibility} />);
    expect(screen.getByText("Có khác biệt quan trọng")).toBeInTheDocument();
    expect(screen.getByText("Khác biệt đáng chú ý")).toBeInTheDocument();
    expect(screen.getByText("Nên trao đổi rõ về môi trường không khói thuốc và việc hút ở ngoài.")).toBeInTheDocument();
    expect(screen.queryByText(/%|điểm|score/i)).not.toBeInTheDocument();
  });

  it("renders all detail dimensions in the frozen order, including not evaluated", () => {
    render(<RoommateCompatibilitySummary compatibility={compatibility} detail />);
    const labels = screen.getAllByRole("listitem").map((item) => item.querySelector("span")?.textContent);
    expect(labels).toEqual([
      "Nhịp sinh hoạt",
      "Mức độ gọn gàng",
      "Ưu tiên không gian",
      "Môi trường thuốc lá",
      "Thú cưng",
      "Ngân sách",
      "Khu vực",
      "Thời gian chuyển vào"
    ]);
    expect(screen.getAllByText("Chưa đủ thông tin").length).toBeGreaterThan(0);
  });

  it("renders a neutral null state and only factual verified badges", () => {
    render(
      <>
        <RoommateCompatibilitySummary compatibility={null} />
        <RoommateVerificationBadges profile={profile} />
      </>
    );
    expect(screen.getByText("Chưa đủ dữ liệu để tổng hợp các điểm cần trao đổi.")).toBeInTheDocument();
    expect(screen.getByText("Email đã xác minh")).toBeInTheDocument();
    expect(screen.queryByText("Số điện thoại đã xác minh")).not.toBeInTheDocument();
    expect(screen.getByText("Thành viên từ tháng 10, 2025")).toBeInTheDocument();
    expect(screen.queryByText("minh@example.com")).not.toBeInTheDocument();
  });
});

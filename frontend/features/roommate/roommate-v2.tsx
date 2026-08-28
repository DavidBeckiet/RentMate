import { Card } from "../../components/ui/card";
import { Icon } from "../../components/ui/icon";
import type {
  RoommateCompatibility,
  RoommateCompatibilityDimension,
  RoommateCompatibilityDimensionResult,
  RoommateCompatibilityExplanationCode,
  RoommateCompatibilityOutcome,
  RoommateProfile
} from "../../types/api";
import { formatMemberSince } from "./roommate-content";

export const roommateCompatibilityDimensionLabels: Record<RoommateCompatibilityDimension, string> = {
  SLEEP: "Nhịp sinh hoạt",
  CLEANLINESS: "Mức độ gọn gàng",
  NOISE: "Ưu tiên không gian",
  SMOKING: "Môi trường thuốc lá",
  PETS: "Thú cưng",
  BUDGET: "Ngân sách",
  AREA: "Khu vực",
  MOVE_IN: "Thời gian chuyển vào"
};

export const roommateCompatibilityOutcomeLabels: Record<RoommateCompatibilityOutcome, string> = {
  ALIGNED: "Phù hợp",
  NEUTRAL: "Có điểm trung tính",
  DISCUSS: "Nên trao đổi",
  IMPORTANT_DIFFERENCE: "Khác biệt đáng chú ý",
  NOT_EVALUATED: "Chưa đủ thông tin"
};

export const roommateCompatibilityCategoryLabels: Record<NonNullable<RoommateCompatibility["category"]>, string> = {
  HIGH_ALIGNMENT: "Nhiều điểm phù hợp",
  MIXED: "Có điểm cần trao đổi",
  IMPORTANT_DIFFERENCE: "Có khác biệt quan trọng"
};

const detailDimensionOrder: readonly RoommateCompatibilityDimension[] = [
  "SLEEP",
  "CLEANLINESS",
  "NOISE",
  "SMOKING",
  "PETS",
  "BUDGET",
  "AREA",
  "MOVE_IN"
];

const highlightDimensionOrder: readonly RoommateCompatibilityDimension[] = [
  "PETS",
  "SMOKING",
  "BUDGET",
  "MOVE_IN",
  "AREA",
  "SLEEP",
  "CLEANLINESS",
  "NOISE"
];

const outcomePriority: Record<RoommateCompatibilityOutcome, number> = {
  IMPORTANT_DIFFERENCE: 0,
  ALIGNED: 1,
  DISCUSS: 2,
  NEUTRAL: 3,
  NOT_EVALUATED: 4
};

const explanationCopy: Record<RoommateCompatibilityExplanationCode, string> = {
  SLEEP_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh nhịp sinh hoạt.",
  SLEEP_ALIGNED_SAME: "Nhịp sinh hoạt được mô tả tương đồng.",
  SLEEP_NEUTRAL_FLEXIBLE: "Một bên linh hoạt về nhịp sinh hoạt.",
  SLEEP_DISCUSS_DIFFERENT: "Nên trao đổi thêm về nhịp sinh hoạt.",
  CLEANLINESS_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh mức độ gọn gàng.",
  CLEANLINESS_ALIGNED_SAME: "Mức độ gọn gàng được mô tả tương đồng.",
  CLEANLINESS_NEUTRAL_BALANCED: "Một bên giữ mức cân bằng về gọn gàng.",
  CLEANLINESS_DISCUSS_DIFFERENT: "Nên trao đổi thêm về cách giữ không gian chung.",
  NOISE_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh ưu tiên không gian.",
  NOISE_ALIGNED_SAME: "Ưu tiên không gian được mô tả tương đồng.",
  NOISE_NEUTRAL_BALANCED: "Một bên giữ mức cân bằng về không gian.",
  NOISE_DISCUSS_DIFFERENT: "Nên trao đổi thêm về cách sử dụng không gian chung.",
  SMOKING_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh môi trường thuốc lá.",
  SMOKING_ALIGNED_SAME: "Môi trường thuốc lá được mô tả tương đồng.",
  SMOKING_NEUTRAL_NO_PREFERENCE: "Một bên không đặt ưu tiên riêng về môi trường thuốc lá.",
  SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR:
    "Nên trao đổi rõ về môi trường không khói thuốc và việc hút ở ngoài.",
  PETS_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh bối cảnh thú cưng.",
  PETS_ALIGNED_SAME: "Bối cảnh thú cưng được mô tả tương đồng.",
  PETS_NEUTRAL_OK_WITH_PETS: "Một bên có thể linh hoạt với thú cưng.",
  PETS_IMPORTANT_DIFFERENCE_NO_PETS_HAS_PET: "Nên trao đổi rõ về việc không nuôi hoặc đang có thú cưng.",
  BUDGET_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh ngân sách.",
  BUDGET_ALIGNED_OVERLAP: "Khung ngân sách có giao nhau.",
  BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP: "Khung ngân sách hiện chưa giao nhau; nên trao đổi thêm.",
  AREA_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh khu vực.",
  AREA_ALIGNED_OVERLAP: "Khu vực quan tâm có phần giao nhau.",
  AREA_IMPORTANT_DIFFERENCE_NO_OVERLAP: "Khu vực quan tâm hiện chưa giao nhau; nên trao đổi thêm.",
  MOVE_IN_NOT_EVALUATED: "Chưa đủ dữ liệu để so sánh thời gian chuyển vào.",
  MOVE_IN_ALIGNED_OVERLAP: "Khoảng thời gian chuyển vào có phần giao nhau.",
  MOVE_IN_IMPORTANT_DIFFERENCE_NO_OVERLAP: "Khoảng thời gian chuyển vào hiện chưa giao nhau; nên trao đổi thêm."
};

export function roommateCompatibilityExplanation(code: RoommateCompatibilityExplanationCode): string {
  return explanationCopy[code];
}

export function selectRoommateCompatibilityHighlights(
  dimensions: readonly RoommateCompatibilityDimensionResult[]
): readonly RoommateCompatibilityDimensionResult[] {
  const dimensionOrder = new Map(highlightDimensionOrder.map((dimension, index) => [dimension, index] as const));
  return [...dimensions]
    .filter((item) => item.outcome !== "NOT_EVALUATED")
    .sort((left, right) => {
      const outcomeDifference = outcomePriority[left.outcome] - outcomePriority[right.outcome];
      if (outcomeDifference !== 0) return outcomeDifference;
      return (
        (dimensionOrder.get(left.dimension) ?? Number.MAX_SAFE_INTEGER) -
        (dimensionOrder.get(right.dimension) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, 3);
}

function outcomeClass(outcome: RoommateCompatibilityOutcome): string {
  if (outcome === "IMPORTANT_DIFFERENCE") return "border-rose-700 bg-rose-50";
  if (outcome === "DISCUSS") return "border-brandBlue-700 bg-blue-50";
  if (outcome === "ALIGNED") return "border-emerald-700 bg-emerald-50";
  return "border-heroDark-950 bg-rent-canvas";
}

function CompatibilityItem({ item }: Readonly<{ item: RoommateCompatibilityDimensionResult }>) {
  return (
    <li className={`border-l-4 px-3 py-2 ${outcomeClass(item.outcome)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ui-sm font-bold text-heroDark-950">
          {roommateCompatibilityDimensionLabels[item.dimension]}
        </span>
        <span className="text-ui-xs font-bold text-heroDark-950">
          {roommateCompatibilityOutcomeLabels[item.outcome]}
        </span>
      </div>
      <p className="mt-1 text-ui-sm leading-6 text-rent-secondary">
        {roommateCompatibilityExplanation(item.explanationCode)}
      </p>
    </li>
  );
}

export function RoommateCompatibilitySummary({
  compatibility,
  detail = false,
  heading = "Gợi ý tương thích"
}: Readonly<{
  compatibility: RoommateCompatibility | null | undefined;
  detail?: boolean;
  heading?: string;
}>) {
  if (compatibility == null) {
    return (
      <Card subtle aria-label={heading} className="space-y-2">
        <h2 className="font-display text-ui-base font-bold">{heading}</h2>
        <p className="text-ui-sm leading-6 text-rent-secondary">Chưa đủ dữ liệu để tổng hợp các điểm cần trao đổi.</p>
      </Card>
    );
  }

  const dimensions = detail
    ? [...compatibility.dimensions].sort(
        (left, right) => detailDimensionOrder.indexOf(left.dimension) - detailDimensionOrder.indexOf(right.dimension)
      )
    : selectRoommateCompatibilityHighlights(compatibility.dimensions);
  const categoryLabel = compatibility.category ? roommateCompatibilityCategoryLabels[compatibility.category] : null;

  return (
    <Card aria-label={heading} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-ui-base font-bold">{heading}</h2>
          <p className="mt-1 text-ui-xs font-semibold text-rent-secondary">
            {detail
              ? `Đã có dữ liệu cho ${compatibility.evaluatedCount}/8 khía cạnh.`
              : "Tóm tắt từ các thông tin mà hai bên đã cung cấp."}
          </p>
        </div>
        {categoryLabel ? (
          <span
            className={`border-2 border-heroDark-950 px-2 py-1 text-ui-xs font-bold ${
              compatibility.category === "IMPORTANT_DIFFERENCE"
                ? "bg-rent-coral"
                : compatibility.category === "HIGH_ALIGNMENT"
                  ? "bg-rent-accent"
                  : "bg-rent-yellow"
            }`}
          >
            {categoryLabel}
          </span>
        ) : (
          <span className="border-2 border-heroDark-950 bg-rent-canvas px-2 py-1 text-ui-xs font-bold">
            Chưa đủ thông tin
          </span>
        )}
      </div>
      {dimensions.length > 0 ? (
        <ul className="space-y-2" aria-label={detail ? "Tất cả khía cạnh tương thích" : "Điểm nổi bật cần trao đổi"}>
          {dimensions.map((item) => (
            <CompatibilityItem key={item.dimension} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-ui-sm leading-6 text-rent-secondary">Chưa đủ dữ liệu để tổng hợp các điểm cần trao đổi.</p>
      )}
    </Card>
  );
}

export function RoommateVerificationBadges({
  profile,
  className = ""
}: Readonly<{ profile: RoommateProfile | null; className?: string }>) {
  if (!profile) return null;
  const memberSince = formatMemberSince(profile.memberSince);
  return (
    <div className={`space-y-2 ${className}`}>
      <ul className="flex flex-wrap gap-2" aria-label="Thông tin xác minh và thành viên">
        {profile.emailVerified ? (
          <li className="inline-flex min-h-8 items-center gap-1 border-2 border-heroDark-950 bg-rent-accent px-2 text-ui-xs font-bold">
            <Icon name="check" className="h-4 w-4" /> Email đã xác minh
          </li>
        ) : null}
        {profile.phoneVerified ? (
          <li className="inline-flex min-h-8 items-center gap-1 border-2 border-heroDark-950 bg-rent-accent px-2 text-ui-xs font-bold">
            <Icon name="check" className="h-4 w-4" /> Số điện thoại đã xác minh
          </li>
        ) : null}
        {memberSince ? (
          <li className="inline-flex min-h-8 items-center border-2 border-heroDark-950 bg-rent-canvas px-2 text-ui-xs font-bold">
            Thành viên từ {memberSince}
          </li>
        ) : null}
      </ul>
      <p className="text-ui-xs leading-5 text-rent-secondary">Xác minh liên hệ không bảo đảm độ an toàn.</p>
    </div>
  );
}

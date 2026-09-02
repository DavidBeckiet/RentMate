import { Card } from "../../components/ui/card";
import { Icon, type IconName } from "../../components/ui/icon";
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

const dimensionIcons: Record<RoommateCompatibilityDimension, IconName> = {
  SLEEP: "eye",
  CLEANLINESS: "sparkles",
  NOISE: "wifi",
  SMOKING: "shield",
  PETS: "home",
  BUDGET: "ruler",
  AREA: "map",
  MOVE_IN: "target"
};

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
  return `rm-roommate-compatibility-item rm-roommate-compatibility-item-${outcome.toLowerCase()}`;
}

function CompatibilityItem({ item }: Readonly<{ item: RoommateCompatibilityDimensionResult }>) {
  return (
    <li
      className={outcomeClass(item.outcome)}
      data-outcome={item.outcome}
      aria-label={`${roommateCompatibilityDimensionLabels[item.dimension]}: ${roommateCompatibilityOutcomeLabels[item.outcome]}`}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface text-primary-hover"
        >
          <Icon name={dimensionIcons[item.dimension]} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-ui-sm font-bold text-foreground">
              {roommateCompatibilityDimensionLabels[item.dimension]}
            </span>
            <span className="rm-roommate-chip" data-outcome={item.outcome}>
              {roommateCompatibilityOutcomeLabels[item.outcome]}
            </span>
          </div>
          <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
            {roommateCompatibilityExplanation(item.explanationCode)}
          </p>
        </div>
      </div>
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
      <Card subtle aria-label={heading} className="rm-roommate-card-static space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-muted-foreground">
            <Icon name="target" className="h-4 w-4" />
          </span>
          <h2 className="font-display text-ui-base font-bold text-foreground">{heading}</h2>
        </div>
        <p className="text-ui-sm leading-6 text-muted-foreground">Chưa đủ dữ liệu để tổng hợp các điểm cần trao đổi.</p>
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
    <Card aria-label={heading} className="rm-roommate-card-static space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary-hover">
            <Icon name="compare" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-heading-sm font-bold text-foreground">{heading}</h2>
            <p className="mt-1 text-ui-xs font-semibold text-muted-foreground">
              {detail
                ? `Đã có dữ liệu cho ${compatibility.evaluatedCount}/8 khía cạnh.`
                : "Tóm tắt từ các thông tin mà hai bên đã cung cấp."}
            </p>
          </div>
        </div>
        <span
          className="rm-roommate-chip"
          data-outcome={
            compatibility.category === "IMPORTANT_DIFFERENCE"
              ? "IMPORTANT_DIFFERENCE"
              : compatibility.category === "HIGH_ALIGNMENT"
                ? "ALIGNED"
                : compatibility.category === "MIXED"
                  ? "DISCUSS"
                  : "NOT_EVALUATED"
          }
        >
          {categoryLabel ?? "Chưa đủ thông tin"}
        </span>
      </div>
      {detail ? (
        <div className="flex flex-wrap gap-2" aria-label="Nhóm kết quả tương thích">
          <span className="rm-roommate-chip" data-outcome="ALIGNED">
            Phù hợp
          </span>
          <span className="rm-roommate-chip" data-outcome="DISCUSS">
            Nên trao đổi
          </span>
          <span className="rm-roommate-chip" data-outcome="IMPORTANT_DIFFERENCE">
            Khác biệt đáng chú ý
          </span>
          <span className="rm-roommate-chip" data-outcome="NOT_EVALUATED">
            Chưa đủ thông tin
          </span>
        </div>
      ) : null}
      {dimensions.length > 0 ? (
        <ul
          className="rm-roommate-compatibility-grid"
          aria-label={detail ? "Tất cả khía cạnh tương thích" : "Điểm nổi bật cần trao đổi"}
        >
          {dimensions.map((item) => (
            <CompatibilityItem key={item.dimension} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-ui-sm leading-6 text-muted-foreground">Chưa đủ dữ liệu để tổng hợp các điểm cần trao đổi.</p>
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
    <div className={`space-y-2 ${className}`} title="Xác minh liên hệ không bảo đảm độ an toàn.">
      <ul className="flex flex-wrap gap-2" aria-label="Thông tin xác minh và thành viên">
        {profile.emailVerified ? (
          <li className="rm-roommate-chip" data-outcome="ALIGNED">
            <Icon name="check" className="h-4 w-4" /> Email đã xác minh
          </li>
        ) : null}
        {profile.phoneVerified ? (
          <li className="rm-roommate-chip" data-outcome="ALIGNED">
            <Icon name="check" className="h-4 w-4" /> Số điện thoại đã xác minh
          </li>
        ) : null}
        {memberSince ? <li className="rm-roommate-chip">Thành viên từ {memberSince}</li> : null}
      </ul>
      <p className="text-ui-xs leading-5 text-muted-foreground">Xác minh liên hệ không bảo đảm độ an toàn.</p>
    </div>
  );
}

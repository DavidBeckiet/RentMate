import { Card } from "../../components/ui/card";
import { Icon } from "../../components/ui/icon";
import type { RoommateRiskFlag, RoommateRiskFlagCode, RoommateRiskSummary } from "../../types/api";
import { formatRoommateDateTime } from "./roommate-content";

export const roommateRiskFlagLabels: Record<RoommateRiskFlagCode, string> = {
  REPEATED_MESSAGE_ACROSS_THREADS: "Lặp lại nội dung tin nhắn giữa nhiều cuộc trò chuyện",
  RAPID_INTEREST_ACTIVITY: "Hoạt động gửi lời quan tâm diễn ra dồn dập",
  HIGH_MESSAGE_VOLUME: "Khối lượng tin nhắn cao",
  REPEATED_EXTERNAL_CONTACT_SOLICITATION: "Lặp lại yêu cầu liên hệ bên ngoài",
  REPEATED_REPORT_PATTERN: "Có nhiều báo cáo lặp lại",
  MULTIPLE_CURRENT_BLOCKERS: "Có nhiều người đang chặn tài khoản này",
  NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY: "Tài khoản mới có hoạt động bất thường"
};

function idList(values: readonly number[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values.map((value) => `#${value}`).join(", ");
}

function evidenceLines(flag: RoommateRiskFlag): readonly string[] {
  const evidence = flag.evidenceSummary;
  const lines: string[] = [];
  const messageIds = idList(evidence.messageIds);
  const interestIds = idList(evidence.interestIds);
  const reportIds = idList(evidence.reportIds);
  if (messageIds) lines.push(`ID tin nhắn: ${messageIds}`);
  if (interestIds) lines.push(`ID lời quan tâm: ${interestIds}`);
  if (reportIds) lines.push(`ID báo cáo: ${reportIds}`);
  if (evidence.distinctCounterpartCount !== undefined) {
    lines.push(`Số đối tác phân biệt: ${evidence.distinctCounterpartCount}`);
  }
  if (evidence.distinctReporterCount !== undefined) {
    lines.push(`Số người báo cáo phân biệt: ${evidence.distinctReporterCount}`);
  }
  if (evidence.currentBlockerCount !== undefined) {
    lines.push(`Số người đang chặn: ${evidence.currentBlockerCount}`);
  }
  if (evidence.accountCreatedAt) {
    lines.push(`Tài khoản tạo ngày: ${formatRoommateDateTime(evidence.accountCreatedAt)}`);
  }
  return lines;
}

export function RoommateRiskSummaryPanel({
  summary,
  heading = "Tín hiệu hỗ trợ xem xét"
}: Readonly<{ summary: RoommateRiskSummary | null | undefined; heading?: string }>) {
  if (!summary) {
    return (
      <Card subtle aria-label={heading} className="space-y-2">
        <h3 className="font-display text-ui-base font-bold">{heading}</h3>
        <p className="text-ui-sm leading-6 text-rent-secondary">Chưa có tín hiệu rủi ro bổ sung cho báo cáo này.</p>
      </Card>
    );
  }

  return (
    <Card aria-label={heading} className="space-y-4 bg-[#fff6ef]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-ui-base font-bold">{heading}</h3>
          <p className="mt-1 text-ui-xs text-rent-secondary">Phiên bản quy tắc: {summary.rulesVersion}</p>
        </div>
        <span
          className={`inline-flex min-h-8 items-center gap-1 border-2 border-heroDark-950 px-2 text-ui-xs font-bold ${
            summary.reviewPriority === "ELEVATED" ? "bg-rent-coral" : "bg-rent-accent"
          }`}
        >
          <Icon name="flag" className="h-4 w-4" />
          {summary.reviewPriority === "ELEVATED" ? "Ưu tiên xem sớm" : "Ưu tiên tiêu chuẩn"}
        </span>
      </div>
      {summary.partialEvaluation ? (
        <p role="status" className="border-l-4 border-brandBlue-700 bg-blue-50 px-3 py-2 text-ui-sm leading-6">
          Một số tín hiệu chưa thể đánh giá vì một dịch vụ phụ thuộc tạm thời không khả dụng.
        </p>
      ) : null}
      {summary.flags.length === 0 ? (
        <p className="text-ui-sm leading-6 text-rent-secondary">Không có tín hiệu bổ sung trong phạm vi đánh giá.</p>
      ) : (
        <ul className="space-y-3" aria-label="Các tín hiệu rủi ro">
          {summary.flags.map((flag) => {
            const evidence = evidenceLines(flag);
            return (
              <li key={flag.code} className="border-l-4 border-heroDark-950 bg-rent-surface px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="text-ui-sm font-bold">{roommateRiskFlagLabels[flag.code]}</h4>
                  {flag.observedCount !== null ? (
                    <span className="text-ui-xs font-bold">Quan sát: {flag.observedCount}</span>
                  ) : null}
                </div>
                {flag.windowStartedAt ? (
                  <p className="mt-1 text-ui-xs text-rent-secondary">
                    Từ {formatRoommateDateTime(flag.windowStartedAt)} đến thời điểm đánh giá.
                  </p>
                ) : null}
                {evidence.length > 0 ? (
                  <ul
                    className="mt-2 space-y-1 text-ui-xs leading-5 text-rent-secondary"
                    aria-label="Bằng chứng giới hạn"
                  >
                    {evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t-2 border-heroDark-950 pt-3 text-ui-xs font-semibold leading-5 text-rent-secondary">
        Các tín hiệu chỉ hỗ trợ ưu tiên xem xét, không tự động ẩn, chặn, giải quyết hoặc kết luận vi phạm.
      </p>
    </Card>
  );
}

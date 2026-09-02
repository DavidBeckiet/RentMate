import { AdminEvidence, AdminPill } from "../../components/ui/admin-workspace";
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
  return (
    <AdminEvidence title={heading} icon="target" tone={summary?.reviewPriority === "ELEVATED" ? "attention" : "muted"}>
      {!summary ? (
        <p>Chưa có tín hiệu rủi ro bổ sung cho báo cáo này.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-ui-xs">Phiên bản quy tắc: {summary.rulesVersion}</p>
            <AdminPill tone={summary.reviewPriority === "ELEVATED" ? "attention" : "muted"}>
              {summary.reviewPriority === "ELEVATED" ? "Ưu tiên xem sớm" : "Ưu tiên tiêu chuẩn"}
            </AdminPill>
          </div>
          {summary.partialEvaluation ? (
            <p
              role="status"
              className="rounded-control border border-info/20 bg-info-subtle px-3 py-2 text-ui-sm leading-6 text-info-foreground"
            >
              Một số tín hiệu chưa thể đánh giá vì một dịch vụ phụ thuộc tạm thời không khả dụng.
            </p>
          ) : null}
          {summary.flags.length === 0 ? (
            <p>Không có tín hiệu bổ sung trong phạm vi đánh giá.</p>
          ) : (
            <ul className="space-y-3" aria-label="Các tín hiệu rủi ro">
              {summary.flags.map((flag) => {
                const evidence = evidenceLines(flag);
                return (
                  <li key={flag.code} className="rounded-control border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-ui-sm font-bold text-foreground">{roommateRiskFlagLabels[flag.code]}</h4>
                      {flag.observedCount !== null ? (
                        <span className="text-ui-xs font-bold text-muted-foreground">
                          Quan sát: {flag.observedCount}
                        </span>
                      ) : null}
                    </div>
                    {flag.windowStartedAt ? (
                      <p className="mt-1 text-ui-xs text-muted-foreground">
                        Từ {formatRoommateDateTime(flag.windowStartedAt)} đến thời điểm đánh giá.
                      </p>
                    ) : null}
                    {evidence.length > 0 ? (
                      <ul
                        className="mt-2 space-y-1 text-ui-xs leading-5 text-muted-foreground"
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
          <p className="border-t border-border pt-3 text-ui-xs font-semibold leading-5 text-muted-foreground">
            Các tín hiệu chỉ hỗ trợ ưu tiên xem xét, không tự động ẩn, chặn, giải quyết hoặc kết luận vi phạm.
          </p>
        </div>
      )}
    </AdminEvidence>
  );
}

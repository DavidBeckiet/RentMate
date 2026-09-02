"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/button";
import { TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { Skeleton } from "../../components/ui/skeleton";
import { api } from "../../lib/api/client";
import type { RoommateAiPreferenceCandidate, RoommateAiPreferenceTarget } from "../../types/api";
import { roommateErrorMessage } from "./roommate-content";

type CandidateValue = RoommateAiPreferenceCandidate["value"];
type Draft = Record<string, CandidateValue>;

const confidenceLabels = { HIGH: "Cao", MEDIUM: "Trung bình", LOW: "Thấp" } as const;
const unresolvedLabels = {
  AMBIGUOUS: "Nội dung còn mơ hồ",
  UNSUPPORTED_PREFERENCE: "Ưu tiên này chưa được hỗ trợ",
  SENSITIVE_OR_PROTECTED_ATTRIBUTE: "Thông tin nhạy cảm không được dùng để gợi ý",
  NO_CANONICAL_VALUE: "Không thể chuyển thành giá trị biểu mẫu chuẩn",
  CONFLICTING_STATEMENTS: "Có các ý mâu thuẫn cần bạn tự chọn"
} as const;

function displayValue(value: CandidateValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function fieldLabel(field: string): string {
  return (
    {
      sleepSchedule: "Nhịp sinh hoạt",
      cleanlinessLevel: "Mức độ gọn gàng",
      noisePreference: "Ưu tiên không gian",
      smokingEnvironment: "Môi trường thuốc lá",
      petEnvironment: "Thú cưng",
      preferredAreaKeys: "Khu vực quan tâm",
      budgetMinPerPerson: "Ngân sách tối thiểu mỗi người",
      budgetMaxPerPerson: "Ngân sách tối đa mỗi người",
      moveInFrom: "Chuyển vào từ ngày",
      moveInUntil: "Chuyển vào đến ngày"
    }[field] ?? field
  );
}

export function RoommateAiPreferencePanel({
  target,
  onApply
}: Readonly<{
  target: RoommateAiPreferenceTarget;
  onApply: (values: Readonly<Record<string, CandidateValue>>) => void;
}>) {
  const headingId = useId();
  const [available, setAvailable] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "editing" | "parsing" | "preview" | "applying" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [confidence, setConfidence] = useState<Readonly<Record<string, keyof typeof confidenceLabels>>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [unresolved, setUnresolved] = useState<readonly { readonly reason: keyof typeof unresolvedLabels }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void api.roommates
      .getAiCapabilities(controller.signal)
      .then((capabilities) => !controller.signal.aborted && setAvailable(capabilities.preferenceParsing))
      .catch(() => !controller.signal.aborted && setAvailable(false));
    return () => controller.abort();
  }, []);

  if (!available) return null;

  const parse = async () => {
    setState("parsing");
    setError(null);
    try {
      const result = await api.roommates.createPreferencePreview({ target, text, locale: "vi" });
      const nextDraft = Object.fromEntries(
        Object.entries(result.proposal).map(([field, candidate]) => [field, candidate.value])
      );
      setDraft(nextDraft);
      setConfidence(
        Object.fromEntries(Object.entries(result.proposal).map(([field, candidate]) => [field, candidate.confidence]))
      );
      setSelected(
        new Set(
          Object.entries(result.proposal)
            .filter(([, candidate]) => candidate.confidence !== "LOW")
            .map(([field]) => field)
        )
      );
      setUnresolved(result.unresolved);
      setState("preview");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
      setState("error");
    }
  };

  const apply = () => {
    setState("applying");
    onApply(Object.fromEntries(Object.entries(draft).filter(([field]) => selected.has(field))));
    setState("preview");
  };

  return (
    <section className="rm-roommate-ai-panel space-y-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rm-roommate-ai-label">
            <Icon name="sparkles" className="h-4 w-4" /> AI hỗ trợ · không tự lưu
          </p>
          <h2 id={headingId} className="mt-3 font-display text-heading-sm font-bold text-foreground">
            Phân tích nhu cầu bằng AI
          </h2>
          <p className="mt-1 max-w-2xl text-ui-sm leading-6 text-muted-foreground">
            Viết nhu cầu theo cách tự nhiên. Bạn luôn xem, sửa hoặc bỏ từng đề xuất trước khi điền vào biểu mẫu; AI
            không tự lưu dữ liệu.
          </p>
        </div>
        <span className="rm-roommate-chip" aria-label="AI chỉ tạo bản xem trước">
          Xem trước
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" aria-label="Quy trình đề xuất">
        <div className="rounded-control bg-surface/70 px-3 py-2 text-ui-xs font-bold text-foreground">
          <span className="text-primary">01</span> · Bạn viết
        </div>
        <div className="rounded-control bg-surface/70 px-3 py-2 text-ui-xs font-bold text-foreground">
          <span className="text-primary">02</span> · AI gợi ý
        </div>
        <div className="rounded-control bg-surface/70 px-3 py-2 text-ui-xs font-bold text-foreground">
          <span className="text-primary">03</span> · Bạn xác nhận
        </div>
      </div>
      <TextareaField
        id={`roommate-ai-text-${target.toLowerCase()}`}
        name="roommateAiText"
        label="Mô tả nhu cầu"
        hint="Từ 20 đến 2.000 ký tự. Không nhập thông tin liên hệ hoặc thông tin nhạy cảm."
        rows={4}
        value={text}
        maxLength={2000}
        onChange={(event) => {
          setText(event.target.value);
          if (state !== "parsing") setState("editing");
        }}
      />
      <Button type="button" pending={state === "parsing"} pendingLabel="Đang phân tích…" onClick={() => void parse()}>
        Phân tích bằng AI
      </Button>
      {state === "parsing" ? (
        <div
          className="space-y-3 rounded-card border border-info/20 bg-surface/70 p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-ui-sm font-semibold text-info-foreground">
            Đang đọc các ưu tiên có thể chuyển thành trường biểu mẫu…
          </p>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
          {error}
        </p>
      ) : null}
      {state === "preview" ? (
        <div className="space-y-3" aria-live="polite">
          {Object.entries(draft).map(([field, value]) => (
            <div
              key={field}
              className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"
            >
              <label className="flex min-h-11 items-center gap-2 text-ui-sm font-bold text-foreground">
                <input
                  type="checkbox"
                  checked={selected.has(field)}
                  onChange={(event) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(field);
                      else next.delete(field);
                      return next;
                    })
                  }
                />
                {fieldLabel(field)}
              </label>
              <input
                aria-label={`Chỉnh sửa ${fieldLabel(field)}`}
                value={displayValue(value)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]:
                      field === "preferredAreaKeys"
                        ? event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean)
                        : event.target.value
                  }))
                }
                className="min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-ui-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-[3px] focus:ring-primary/20"
              />
              <span className="text-ui-xs font-bold text-muted-foreground">
                Độ tin cậy: {confidenceLabels[confidence[field] ?? "LOW"]}
              </span>
            </div>
          ))}
          {unresolved.length ? (
            <ul
              className="rm-roommate-callout space-y-2 text-ui-sm text-muted-foreground"
              aria-label="Nội dung cần bạn tự xem lại"
            >
              {unresolved.map((item, index) => (
                <li key={`${item.reason}-${index}`}>{unresolvedLabels[item.reason]}</li>
              ))}
            </ul>
          ) : null}
          <Button type="button" onClick={apply}>
            Dùng đề xuất
          </Button>
          <p className="text-ui-xs font-semibold text-muted-foreground">
            Chỉ điền các trường được chọn. Bạn vẫn cần bấm nút Lưu/Tạo/Cập nhật của biểu mẫu.
          </p>
        </div>
      ) : null}
    </section>
  );
}

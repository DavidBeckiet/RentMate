"use client";

import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import type { ContactReportCategory, Inquiry } from "../../types/api";

const contactReportCategories: readonly { readonly value: ContactReportCategory; readonly label: string }[] = [
  { value: "SPAM", label: "Spam hoặc quảng cáo" },
  { value: "FRAUD", label: "Nghi ngờ lừa đảo" },
  { value: "HARASSMENT", label: "Quấy rối" },
  { value: "INAPPROPRIATE", label: "Nội dung không phù hợp" },
  { value: "OTHER", label: "Lý do khác" }
];

function safetyErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Bạn đã có một báo cáo đang được xử lý cho cuộc trò chuyện này.";
  }
  return "Chưa thể thực hiện thao tác. Vui lòng thử lại.";
}

export function InquirySafetyMenu({
  inquiry,
  onInquiryChange
}: Readonly<{
  inquiry: Inquiry;
  onInquiryChange: (next: Pick<Inquiry, "canSendMessage" | "blockedByCurrentUser">) => void;
}>) {
  const [safetyPending, setSafetyPending] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ContactReportCategory>("SPAM");
  const [reportDetails, setReportDetails] = useState("");
  const [reportMessageId, setReportMessageId] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const toggleBlock = async () => {
    if (safetyPending) return;
    if (!inquiry.blockedByCurrentUser && !window.confirm("Chặn liên hệ này? Hai bên sẽ không thể gửi tin nhắn mới.")) {
      return;
    }

    setSafetyPending(true);
    setSafetyError(null);
    try {
      const nextState = inquiry.blockedByCurrentUser
        ? await api.contact.unblockInquiry(inquiry.id)
        : await api.contact.blockInquiry(inquiry.id);
      onInquiryChange(nextState);
    } catch (caught: unknown) {
      setSafetyError(safetyErrorMessage(caught));
    } finally {
      setSafetyPending(false);
    }
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (safetyPending) return;

    setSafetyPending(true);
    setSafetyError(null);
    try {
      await api.contact.createContactReport(inquiry.id, {
        category: reportCategory,
        details: reportDetails.trim() || null,
        messageId: reportMessageId ? Number(reportMessageId) : null
      });
      setReportSubmitted(true);
      setReportOpen(false);
      setReportDetails("");
      setReportMessageId("");
    } catch (caught: unknown) {
      setSafetyError(safetyErrorMessage(caught));
    } finally {
      setSafetyPending(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <DropdownMenu label="Thao tác an toàn" trigger={<Icon name="flag" className="h-4 w-4" />} className="shrink-0">
        <DropdownMenuItem disabled={safetyPending} onClick={() => void toggleBlock()}>
          {inquiry.blockedByCurrentUser ? "Bỏ chặn liên hệ" : "Chặn liên hệ"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={safetyPending}
          onClick={() => {
            setReportOpen(true);
            setReportSubmitted(false);
            setSafetyError(null);
          }}
        >
          Báo cáo cuộc trò chuyện
        </DropdownMenuItem>
      </DropdownMenu>

      {reportSubmitted ? (
        <p role="status" className="max-w-64 text-right text-xs font-semibold text-success-foreground">
          Đã gửi báo cáo. RentMate sẽ xem xét thông tin này.
        </p>
      ) : null}
      {safetyError ? (
        <p role="alert" className="max-w-64 text-right text-xs font-semibold text-danger">
          {safetyError}
        </p>
      ) : null}
      {reportOpen ? (
        <form
          onSubmit={(event) => void submitReport(event)}
          aria-label="Báo cáo cuộc trò chuyện"
          className="w-[min(19rem,calc(100vw-3rem))] space-y-3 rounded-card border border-border bg-surface p-3 shadow-raised"
        >
          <p className="text-sm font-bold text-foreground">Báo cáo cuộc trò chuyện</p>
          <label className="block text-xs font-bold" htmlFor={`floating-report-category-${inquiry.id}`}>
            Lý do
            <select
              id={`floating-report-category-${inquiry.id}`}
              value={reportCategory}
              onChange={(event) => setReportCategory(event.target.value as ContactReportCategory)}
              className="mt-1 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm"
            >
              {contactReportCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold" htmlFor={`floating-report-message-${inquiry.id}`}>
            Tin nhắn liên quan
            <select
              id={`floating-report-message-${inquiry.id}`}
              value={reportMessageId}
              onChange={(event) => setReportMessageId(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm"
            >
              <option value="">Toàn bộ cuộc trò chuyện</option>
              {inquiry.messages.map((item) => (
                <option key={item.id} value={item.id}>
                  Tin nhắn · {item.senderRole === "TENANT" ? "Người thuê" : "Chủ trọ"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold" htmlFor={`floating-report-details-${inquiry.id}`}>
            Chi tiết (không bắt buộc)
            <textarea
              id={`floating-report-details-${inquiry.id}`}
              value={reportDetails}
              onChange={(event) => setReportDetails(event.target.value)}
              maxLength={2000}
              rows={3}
              className="mt-1 block min-h-20 w-full resize-y rounded-control border border-border-strong bg-surface p-2 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" pending={safetyPending} className="min-h-11 flex-1">
              Gửi báo cáo
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={safetyPending}
              onClick={() => setReportOpen(false)}
              className="min-h-11"
            >
              Hủy
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

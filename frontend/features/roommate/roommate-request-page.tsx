"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { InputField, TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import styles from "./roommate-request.module.css";
import { api, ApiError } from "../../lib/api/client";
import { formatAreaLabel } from "../../lib/area";
import { useAuth } from "../../lib/auth/auth-provider";
import type { RoommateRequest } from "../../types/api";
import { RoommateAiPreferencePanel } from "./roommate-ai-preference-panel";
import { RoommateListingPicker } from "./roommate-listing-picker";
import {
  isRoommateListingEligible,
  roommateListingFromDetail,
  roommateListingFromSummary,
  type RoommateListingOption
} from "./roommate-listing-selection";
import {
  addDays,
  dayInputValue,
  formatRoommateDateTime,
  formatRoommateMoney,
  isRoommateRequestExpiring,
  parseAreaKeys,
  roommateErrorMessage,
  roommateRequestStatusLabels,
  roommateSafetyCopy
} from "./roommate-content";
import {
  RoommatePageHeader,
  RoommateRequestFacts,
  RoommateSafetyNotice,
  RoommateStatusPill,
  RoommateTenantBoundary
} from "./roommate-shared";
import { RoommateRequestListingSummary } from "./roommate-request-listing-summary";

interface RequestFormValues {
  readonly areas: string;
  readonly budgetMinPerPerson: string;
  readonly budgetMaxPerPerson: string;
  readonly moveInMode: "date" | "range";
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly note: string;
}

type RequestFeedbackKind = "created" | "updated" | "linked" | "unlinked" | "cancelled" | "renewed";

interface RequestFeedback {
  readonly request: RoommateRequest;
  readonly kind: RequestFeedbackKind;
}

const requestFeedbackMessages: Record<RequestFeedbackKind, string> = {
  created: "Nhu cầu ở ghép đã được đăng.",
  updated: "Đã lưu thay đổi của nhu cầu.",
  linked: "Đã gắn phòng đã chọn.",
  unlinked: "Đã gỡ phòng. Bạn có thể tiếp tục cùng tìm phòng phù hợp.",
  cancelled: "Nhu cầu ở ghép đã được đóng.",
  renewed: "Nhu cầu đã được gia hạn thêm 30 ngày. Các lời quan tâm cũ không được khôi phục."
};

function defaultValues(): RequestFormValues {
  const from = dayInputValue();
  return {
    areas: "",
    budgetMinPerPerson: "",
    budgetMaxPerPerson: "",
    moveInMode: "range",
    moveInFrom: from,
    moveInUntil: addDays(from, 30),
    note: ""
  };
}

function valuesFromRequest(request: RoommateRequest): RequestFormValues {
  return {
    areas: request.preferredAreaKeys.map(formatAreaLabel).join(", "),
    budgetMinPerPerson: String(request.budgetMinPerPerson),
    budgetMaxPerPerson: String(request.budgetMaxPerPerson),
    moveInMode: request.moveInFrom === request.moveInUntil ? "date" : "range",
    moveInFrom: request.moveInFrom,
    moveInUntil: request.moveInUntil,
    note: request.note ?? ""
  };
}

function currencyDigits(value: string): string {
  return value.replace(/\D/gu, "");
}

function formatCurrencyEntry(value: string): string {
  const digits = currencyDigits(value);
  const amount = Number(digits);
  if (!digits || !Number.isSafeInteger(amount)) return digits;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount);
}

function requestMoveInUntil(values: RequestFormValues): string {
  return values.moveInMode === "date" ? values.moveInFrom : values.moveInUntil;
}

function applyRequestPreferencePreview(
  current: RequestFormValues,
  preview: Readonly<Record<string, string | number | readonly string[]>>
): RequestFormValues {
  const areas = preview.preferredAreaKeys;
  const budgetMin = preview.budgetMinPerPerson;
  const budgetMax = preview.budgetMaxPerPerson;
  const from = preview.moveInFrom;
  const until = preview.moveInUntil;
  return {
    ...current,
    ...(Array.isArray(areas) ? { areas: areas.join(", ") } : {}),
    ...(typeof budgetMin === "string" || typeof budgetMin === "number"
      ? { budgetMinPerPerson: String(budgetMin) }
      : {}),
    ...(typeof budgetMax === "string" || typeof budgetMax === "number"
      ? { budgetMaxPerPerson: String(budgetMax) }
      : {}),
    ...(typeof from === "string" ? { moveInFrom: from } : {}),
    ...(typeof until === "string" ? { moveInUntil: until } : {})
  };
}

function RequestFields({
  values,
  onChange,
  requireArea
}: Readonly<{
  values: RequestFormValues;
  onChange: (values: RequestFormValues) => void;
  requireArea: boolean;
}>) {
  return (
    <div className={`grid gap-5 sm:grid-cols-2 ${styles.fields}`}>
      <div className="sm:col-span-2 border-t border-border pt-2">
        <p className="rm-roommate-section-label">Ngân sách</p>
        <p className="mt-1 text-ui-sm text-muted-foreground">Khoảng ngân sách mỗi người cho một tháng.</p>
      </div>
      <InputField
        id="roommate-request-budget-min"
        name="budgetMinPerPerson"
        label="Ngân sách tối thiểu mỗi người"
        hint="đ/người/tháng"
        placeholder="Ví dụ: 3.000.000"
        required
        type="text"
        inputMode="numeric"
        value={formatCurrencyEntry(values.budgetMinPerPerson)}
        onChange={(event) => onChange({ ...values, budgetMinPerPerson: currencyDigits(event.target.value) })}
      />
      <InputField
        id="roommate-request-budget-max"
        name="budgetMaxPerPerson"
        label="Ngân sách tối đa mỗi người"
        hint="đ/người/tháng"
        placeholder="Ví dụ: 5.000.000"
        required
        type="text"
        inputMode="numeric"
        value={formatCurrencyEntry(values.budgetMaxPerPerson)}
        onChange={(event) => onChange({ ...values, budgetMaxPerPerson: currencyDigits(event.target.value) })}
      />
      {values.budgetMinPerPerson && values.budgetMaxPerPerson ? (
        <p className="sm:col-span-2 -mt-3 text-ui-sm font-semibold text-primary-hover" role="status">
          Khoảng {formatRoommateMoney(Number(values.budgetMinPerPerson))} –{" "}
          {formatRoommateMoney(Number(values.budgetMaxPerPerson))}
          /người/tháng
        </p>
      ) : null}
      <div className="sm:col-span-2 border-t border-border pt-2">
        <p className="rm-roommate-section-label">Khu vực</p>
        <p className="mt-1 text-ui-sm text-muted-foreground">
          Chọn quận hoặc khu vực muốn sống. RentMate dùng các giá trị này để lọc và tính mức phù hợp.
        </p>
      </div>
      <div className="sm:col-span-2">
        <InputField
          id="roommate-request-areas"
          name="areas"
          label="Khu vực quan tâm"
          hint={
            requireArea
              ? "Nhập từ 1 đến 5 quận hoặc khu vực, ngăn cách bằng dấu phẩy; không nhập địa chỉ nhà hiện tại."
              : "Tùy chọn khi đã chọn phòng, tối đa 5 khu vực; không nhập địa chỉ riêng tư."
          }
          required={requireArea}
          value={values.areas}
          placeholder="Ví dụ: Quận 3, Bình Thạnh"
          maxLength={600}
          onChange={(event) => onChange({ ...values, areas: event.target.value })}
        />
      </div>
      <div className="sm:col-span-2 border-t border-border pt-2">
        <p className="rm-roommate-section-label">Thời gian chuyển vào</p>
        <p className="mt-1 text-ui-sm text-muted-foreground">Chọn một ngày hoặc khoảng thời gian phù hợp với bạn.</p>
      </div>
      <fieldset className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Khi nào bạn dự định chuyển vào?</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border px-3 py-2 text-ui-sm font-semibold text-foreground has-[:checked]:border-primary has-[:checked]:bg-primary-subtle">
          <input
            type="radio"
            name="roommate-move-in-mode"
            value="date"
            checked={values.moveInMode === "date"}
            onChange={() => onChange({ ...values, moveInMode: "date", moveInUntil: values.moveInFrom })}
          />
          Một ngày cụ thể
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border px-3 py-2 text-ui-sm font-semibold text-foreground has-[:checked]:border-primary has-[:checked]:bg-primary-subtle">
          <input
            type="radio"
            name="roommate-move-in-mode"
            value="range"
            checked={values.moveInMode === "range"}
            onChange={() =>
              onChange({
                ...values,
                moveInMode: "range",
                moveInUntil:
                  values.moveInFrom === values.moveInUntil ? addDays(values.moveInFrom, 30) : values.moveInUntil
              })
            }
          />
          Trong một khoảng thời gian
        </label>
      </fieldset>
      {values.moveInMode === "date" ? (
        <div className="sm:col-span-2">
          <InputField
            id="roommate-request-move-in-from"
            name="moveInDate"
            label="Ngày dự kiến chuyển vào"
            required
            type="date"
            value={values.moveInFrom}
            onChange={(event) =>
              onChange({ ...values, moveInFrom: event.target.value, moveInUntil: event.target.value })
            }
          />
        </div>
      ) : (
        <>
          <InputField
            id="roommate-request-move-in-from"
            name="moveInFrom"
            label="Từ ngày"
            required
            type="date"
            value={values.moveInFrom}
            onChange={(event) => onChange({ ...values, moveInFrom: event.target.value })}
          />
          <InputField
            id="roommate-request-move-in-until"
            name="moveInUntil"
            label="Đến ngày"
            required
            type="date"
            value={values.moveInUntil}
            onChange={(event) => onChange({ ...values, moveInUntil: event.target.value })}
          />
        </>
      )}
      <div className="sm:col-span-2">
        <p className="rm-roommate-section-label">Xem lại</p>
        <p className="mt-1 mb-2 text-ui-sm text-muted-foreground">
          Có thể ghi mốc thuận tiện như trường hoặc nơi làm việc để người xem hiểu thêm. Nội dung này chưa được
          dùng để lọc theo khoảng cách.
        </p>
        <TextareaField
          id="roommate-request-note"
          name="note"
          label="Ghi chú thêm"
          hint="Không bắt buộc, tối đa 500 ký tự. Không chia sẻ địa chỉ chính xác, thông tin liên hệ hoặc tài chính."
          maxLength={500}
          rows={3}
          placeholder="Ví dụ: ưu tiên gần ĐH Kinh tế, đi làm ở trung tâm; mong người ở cùng gọn gàng…"
          value={values.note}
          onChange={(event) => onChange({ ...values, note: event.target.value })}
        />
      </div>
    </div>
  );
}

function CreateRequestForm({
  initialListingId,
  onCreated
}: Readonly<{ initialListingId: number | null; onCreated: (request: RoommateRequest) => void }>) {
  const [mode, setMode] = useState<"LINKED" | "UNLINKED">(initialListingId ? "LINKED" : "UNLINKED");
  const [values, setValues] = useState<RequestFormValues>(defaultValues);
  const [selectedListing, setSelectedListing] = useState<RoommateListingOption | null>(null);
  const [listingLoadState, setListingLoadState] = useState<"idle" | "loading" | "error">(
    initialListingId ? "loading" : "idle"
  );
  const [listingError, setListingError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialListingId) return;
    const controller = new AbortController();
    setListingLoadState("loading");
    setListingError(null);
    void api.listings
      .getPublicDetail(initialListingId, controller.signal)
      .then((listing) => {
        if (controller.signal.aborted) return;
        const candidate = roommateListingFromDetail(listing);
        if (!isRoommateListingEligible(candidate)) {
          setListingError("Phòng này hiện không đủ điều kiện để đăng nhu cầu ở ghép.");
          setListingLoadState("idle");
          return;
        }
        setSelectedListing(candidate);
        setListingLoadState("idle");
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setListingError(roommateErrorMessage(caught));
          setListingLoadState("error");
        }
      });
    return () => controller.abort();
  }, [initialListingId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const areas = parseAreaKeys(values.areas);
    if (mode === "UNLINKED" && areas.length === 0) {
      setError("Hãy nhập ít nhất một khu vực quan tâm khi chưa chọn phòng cụ thể.");
      return;
    }
    if (mode === "LINKED" && !selectedListing) {
      setError("Hãy chọn một phòng đang được đăng phù hợp trước khi đăng nhu cầu.");
      return;
    }
    const budgetMinPerPerson = Number(currencyDigits(values.budgetMinPerPerson));
    const budgetMaxPerPerson = Number(currencyDigits(values.budgetMaxPerPerson));
    const moveInUntil = requestMoveInUntil(values);
    if (
      !Number.isSafeInteger(budgetMinPerPerson) ||
      budgetMinPerPerson < 1 ||
      !Number.isSafeInteger(budgetMaxPerPerson) ||
      budgetMaxPerPerson < 1 ||
      !values.moveInFrom ||
      !moveInUntil
    ) {
      setError("Hãy nhập ngân sách hợp lệ và thời gian dự kiến chuyển vào.");
      return;
    }
    if (budgetMinPerPerson > budgetMaxPerPerson) {
      setError("Ngân sách tối thiểu không thể lớn hơn ngân sách tối đa.");
      return;
    }
    if (values.moveInMode === "range" && values.moveInFrom > moveInUntil) {
      setError("Ngày bắt đầu cần trước ngày kết thúc.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const request = await api.roommates.createRequest({
        listingId: mode === "LINKED" ? (selectedListing?.id ?? null) : null,
        preferredAreaKeys: areas,
        budgetMinPerPerson,
        budgetMaxPerPerson,
        moveInFrom: values.moveInFrom,
        moveInUntil,
        note: values.note.trim() || null
      });
      onCreated(request);
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className={`rm-roommate-card-static space-y-5 ${styles.create}`}>
      <div>
        <p className="rm-roommate-section-label">Nhu cầu tìm chỗ</p>
        <h2 className="mt-1 font-display text-heading-md font-bold text-foreground">Đăng nhu cầu tìm người ở ghép</h2>
        <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
          Bạn đang cùng tìm phòng hay đã có một phòng muốn cân nhắc? Chọn cách bắt đầu phù hợp.
        </p>
      </div>
      <fieldset className={styles.modePicker}>
        <legend className="text-ui-sm font-bold text-foreground sm:col-span-2">Bạn muốn bắt đầu như thế nào?</legend>
        <button
          type="button"
          aria-pressed={mode === "UNLINKED"}
          onClick={() => setMode("UNLINKED")}
          className={`min-h-28 rounded-card border p-4 text-left text-ui-sm transition-[background-color,border-color,transform] duration-fast ${mode === "UNLINKED" ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-subtle"}`}
        >
          <strong className="block">Cùng tìm phòng</strong>
          <span className="mt-1 block text-muted-foreground">
            Bắt đầu bằng khu vực, ngân sách và thời gian chuyển vào.
          </span>
        </button>
        <button
          type="button"
          aria-pressed={mode === "LINKED"}
          onClick={() => setMode("LINKED")}
          className={`min-h-28 rounded-card border p-4 text-left text-ui-sm transition-[background-color,border-color,transform] duration-fast ${mode === "LINKED" ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-subtle"}`}
        >
          <strong className="block">Đã có phòng muốn cân nhắc</strong>
          <span className="mt-1 block text-muted-foreground">Chọn phòng đang được đăng, phù hợp từ 2 người.</span>
        </button>
      </fieldset>
      <form className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
        <RequestFields values={values} onChange={setValues} requireArea={mode === "UNLINKED"} />
        <RoommateAiPreferencePanel
          target="REQUEST"
          onApply={(preview) => setValues((current) => applyRequestPreferencePreview(current, preview))}
        />
        {mode === "LINKED" ? (
          <section className="space-y-3" aria-labelledby="roommate-create-linked-listing-heading">
            <div>
              <p className="rm-roommate-section-label">Phòng đang cân nhắc (không bắt buộc)</p>
              <h3 id="roommate-create-linked-listing-heading" className="mt-1 font-display text-ui-base font-bold">
                Nếu bạn đã có phòng muốn xem cùng người ở ghép
              </h3>
            </div>
            {listingLoadState === "loading" ? <LoadingState message="Đang kiểm tra phòng đã chọn…" /> : null}
            {listingError ? (
              <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
                {listingError}
              </p>
            ) : null}
            <RoommateListingPicker
              selected={selectedListing}
              disabled={listingLoadState === "loading"}
              onSelect={setSelectedListing}
            />
          </section>
        ) : null}
        {error ? (
          <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
            {error}
          </p>
        ) : null}
        <RoommateSafetyNotice kind="long" />
        <Button className="w-full sm:w-auto" type="submit" pending={pending} pendingLabel="Đang đăng nhu cầu…">
          Đăng nhu cầu
        </Button>
      </form>
    </Card>
  );
}

function ManagedRequest({
  request,
  initialListingId,
  onChanged
}: Readonly<{
  request: RoommateRequest;
  initialListingId: number | null;
  onChanged: (request: RoommateRequest, kind: Exclude<RequestFeedbackKind, "created">) => void;
}>) {
  const [values, setValues] = useState<RequestFormValues>(() => valuesFromRequest(request));
  const [selectedListing, setSelectedListing] = useState<RoommateListingOption | null>(() =>
    request.listing ? roommateListingFromSummary(request.listing) : null
  );
  const [ctaListingState, setCtaListingState] = useState<"idle" | "loading" | "error">("idle");
  const [ctaListingError, setCtaListingError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "link" | "unlink" | "cancel" | "renew" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmListingReplacement, setConfirmListingReplacement] = useState(false);
  const [editing, setEditing] = useState(false);

  const closeListingReplacement = useCallback(() => {
    if (pendingAction === "link") return;
    setConfirmListingReplacement(false);
    setSelectedListing(request.listing ? roommateListingFromSummary(request.listing) : null);
    setError(null);
  }, [pendingAction, request.listing]);

  useEffect(() => {
    setValues(valuesFromRequest(request));
    setSelectedListing(request.listing ? roommateListingFromSummary(request.listing) : null);
  }, [request]);

  useEffect(() => {
    if (!initialListingId || request.status !== "OPEN" || request.listingId === initialListingId) return;
    const controller = new AbortController();
    setCtaListingState("loading");
    setCtaListingError(null);
    void api.listings
      .getPublicDetail(initialListingId, controller.signal)
      .then((listing) => {
        if (controller.signal.aborted) return;
        const candidate = roommateListingFromDetail(listing);
        if (!isRoommateListingEligible(candidate)) {
          setCtaListingError("Phòng này hiện không còn đủ điều kiện để liên kết với nhu cầu ở ghép.");
          setCtaListingState("error");
          return;
        }
        setSelectedListing(candidate);
        setCtaListingState("idle");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setCtaListingError(roommateErrorMessage(caught));
        setCtaListingState("error");
      });
    return () => controller.abort();
  }, [initialListingId, request.listingId, request.status]);

  const update = async () => {
    const budgetMinPerPerson = Number(currencyDigits(values.budgetMinPerPerson));
    const budgetMaxPerPerson = Number(currencyDigits(values.budgetMaxPerPerson));
    const moveInUntil = requestMoveInUntil(values);
    if (
      !Number.isSafeInteger(budgetMinPerPerson) ||
      budgetMinPerPerson < 1 ||
      !Number.isSafeInteger(budgetMaxPerPerson) ||
      budgetMaxPerPerson < 1 ||
      !values.moveInFrom ||
      !moveInUntil
    ) {
      setError("Hãy nhập ngân sách hợp lệ và thời gian dự kiến chuyển vào.");
      return;
    }
    if (budgetMinPerPerson > budgetMaxPerPerson) {
      setError("Ngân sách tối thiểu không thể lớn hơn ngân sách tối đa.");
      return;
    }
    if (values.moveInMode === "range" && values.moveInFrom > moveInUntil) {
      setError("Ngày bắt đầu cần trước ngày kết thúc.");
      return;
    }
    setPendingAction("save");
    setError(null);
    try {
      const updated = await api.roommates.updateRequest(request.id, {
        preferredAreaKeys: parseAreaKeys(values.areas),
        budgetMinPerPerson,
        budgetMaxPerPerson,
        moveInFrom: values.moveInFrom,
        moveInUntil,
        note: values.note.trim() || null
      });
      onChanged(updated, "updated");
      setEditing(false);
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const persistListingLink = async () => {
    if (!selectedListing) {
      setError("Hãy chọn một phòng đang được đăng trước khi liên kết.");
      return;
    }
    setPendingAction("link");
    setError(null);
    try {
      const updated = await api.roommates.linkListing(request.id, selectedListing.id);
      setConfirmListingReplacement(false);
      onChanged(updated, "linked");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const link = () => {
    if (!selectedListing) {
      setError("Hãy chọn một phòng đang được đăng trước khi liên kết.");
      return;
    }
    if (request.listingId !== null && request.listingId !== selectedListing.id) {
      setError(null);
      setConfirmListingReplacement(true);
      return;
    }
    void persistListingLink();
  };

  const unlink = async () => {
    if (request.preferredAreaKeys.length === 0) {
      setError("Hãy lưu ít nhất một khu vực quan tâm trước khi gỡ phòng đã chọn.");
      return;
    }
    setPendingAction("unlink");
    setError(null);
    try {
      onChanged(await api.roommates.unlinkListing(request.id), "unlinked");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const cancel = async () => {
    setPendingAction("cancel");
    setError(null);
    try {
      onChanged(await api.roommates.cancelRequest(request.id), "cancelled");
      setConfirmCancel(false);
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const renew = async () => {
    setPendingAction("renew");
    setError(null);
    try {
      onChanged(await api.roommates.renewRequest(request.id), "renewed");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const editable = request.status === "OPEN";
  const expiringSoon = request.status === "OPEN" && isRoommateRequestExpiring(request.expiresAt);
  return (
    <div className={styles.managed} data-editable={editable} data-editing={editing}>
      <Card className={`rm-roommate-card-static space-y-5 ${styles.overview}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="rm-roommate-section-label">Nhu cầu của bạn</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-heading-md font-bold text-foreground">Nhu cầu tìm người ở ghép</h2>
              <RoommateStatusPill status={request.status} label={roommateRequestStatusLabels[request.status]} />
            </div>
            <p className="mt-2 text-ui-sm text-muted-foreground">
              Hết hạn lúc {formatRoommateDateTime(request.expiresAt)}
            </p>
            {expiringSoon ? (
              <p
                role="status"
                className="rm-roommate-callout mt-3 text-ui-sm font-semibold text-warning-foreground"
                data-tone="warning"
              >
                Nhu cầu sắp hết hạn trong vòng 3 ngày. Sau khi hết hạn, bạn có thể gia hạn để bắt đầu chu kỳ 30 ngày
                mới.
              </p>
            ) : null}
          </div>
          <Link
            href={`/roommates/requests/${request.id}`}
            className="inline-flex min-h-11 items-center text-ui-sm font-bold text-primary-hover underline decoration-2 underline-offset-4"
          >
            Xem chi tiết
          </Link>
        </div>
        <RoommateRequestFacts request={request} showStatus={false} />
        {initialListingId && request.status === "OPEN" && request.listingId !== initialListingId ? (
          <div className="space-y-3 border-t border-border pt-4">
            {ctaListingState === "loading" ? <LoadingState message="Đang kiểm tra phòng đã chọn…" /> : null}
            {ctaListingError ? (
              <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
                {ctaListingError}
              </p>
            ) : null}
            {selectedListing?.id === initialListingId ? (
              <div className="rm-roommate-callout space-y-3 text-ui-sm leading-6" data-tone="accent">
                <p>
                  Bạn vừa chọn phòng từ trang chi tiết. Có thể gắn thẳng vào nhu cầu này hoặc chọn một phòng khác trước
                  khi tiếp tục.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button pending={pendingAction === "link"} pendingLabel="Đang liên kết…" onClick={() => void link()}>
                    <Icon name="arrowUpRight" className="h-4 w-4" /> Gắn phòng này vào nhu cầu
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    Chọn phòng khác
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {initialListingId && request.status !== "OPEN" && request.listingId !== initialListingId ? (
          <p className="rm-roommate-callout text-ui-sm leading-6" data-tone="info" role="status">
            Phòng từ trang bạn vừa xem chưa được liên kết. Nhu cầu này không còn mở nên không thể thay đổi phòng tại
            đây; trạng thái và kết nối hiện tại vẫn được giữ nguyên.
          </p>
        ) : null}
        {request.note ? (
          <section className="border-t border-border pt-4" aria-labelledby="roommate-request-note-heading">
            <h3 id="roommate-request-note-heading" className="font-display text-ui-base font-bold text-foreground">
              Ghi chú
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-ui-sm leading-6 text-muted-foreground">{request.note}</p>
          </section>
        ) : null}
        <RoommateRequestListingSummary
          request={request}
          onChangeListing={editable ? () => setEditing(true) : undefined}
        />
        {editable && request.listingId === null ? (
          <section className="space-y-3" aria-label="Chọn phòng cân nhắc">
            <RoommateListingPicker selected={selectedListing} onSelect={setSelectedListing} />
            {selectedListing ? (
              <Button pending={pendingAction === "link"} pendingLabel="Đang liên kết…" onClick={link}>
                Gắn phòng đã chọn
              </Button>
            ) : null}
          </section>
        ) : null}
        {request.status === "OPEN" && request.signals.listingCurrentlyAvailable === false ? (
          <RoommateSafetyNotice kind="long" />
        ) : null}
        {request.status === "MATCHED" ? (
          <Link
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface hover:bg-primary-hover"
            href="/roommates/connection"
          >
            Mở kết nối hiện tại
          </Link>
        ) : null}
        {request.status === "EXPIRED" ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-ui-sm leading-6 text-muted-foreground">
              Gia hạn sẽ tạo chu kỳ 30 ngày mới và không khôi phục các lời quan tâm cũ.
            </p>
            <Button pending={pendingAction === "renew"} pendingLabel="Đang gia hạn…" onClick={() => void renew()}>
              <Icon name="refresh" className="h-4 w-4" /> Gia hạn nhu cầu
            </Button>
          </div>
        ) : null}
        {editable ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant={editing ? "outline" : "primary"}
              aria-expanded={editing}
              aria-controls="roommate-request-editor"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Thu gọn chỉnh sửa" : "Chỉnh sửa nhu cầu"}
            </Button>
            <Button variant="outline" onClick={() => setConfirmCancel(true)}>
              Đóng nhu cầu
            </Button>
          </div>
        ) : null}
      </Card>

      {editable && editing ? (
        <Card id="roommate-request-editor" className={`rm-roommate-card-static space-y-5 ${styles.edit}`}>
          <div>
            <p className="rm-roommate-section-label">Chỉnh sửa</p>
            <h2 className="mt-1 font-display text-heading-md font-bold text-foreground">Cập nhật nhu cầu của bạn</h2>
            <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
              Cập nhật nhu cầu để người khác biết bạn đang tìm gì. Bấm lưu sau khi chỉnh sửa.
            </p>
          </div>
          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void update();
            }}
          >
            <RequestFields values={values} onChange={setValues} requireArea={request.listingMode === "UNLINKED"} />
            <Button
              className="w-full sm:w-auto"
              pending={pendingAction === "save"}
              pendingLabel="Đang lưu…"
              type="submit"
            >
              Lưu thay đổi
            </Button>
          </form>
          <RoommateAiPreferencePanel
            target="REQUEST"
            onApply={(preview) => setValues((current) => applyRequestPreferencePreview(current, preview))}
          />
          {request.listingId !== null ? (
            <section className="space-y-3 border-t border-border pt-4" aria-label="Chọn phòng cân nhắc">
              <div>
                <h3 className="font-display text-ui-base font-bold text-foreground">Phòng đang cân nhắc</h3>
                <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">
                  Không bắt buộc. Chỉ thêm ngữ cảnh để mọi người cùng trao đổi; liên kết không giữ chỗ và không xác nhận
                  thuê.
                </p>
              </div>
              <RoommateListingPicker
                selected={selectedListing}
                linkedListingId={request.listingId}
                onSelect={setSelectedListing}
              />
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                {selectedListing && selectedListing.id !== request.listingId ? (
                  <Button pending={pendingAction === "link"} pendingLabel="Đang liên kết…" onClick={link}>
                    Gắn phòng đã chọn
                  </Button>
                ) : request.listingId !== null ? (
                  <span
                    className="inline-flex min-h-11 items-center gap-2 text-ui-sm font-semibold text-success-foreground"
                    role="status"
                  >
                    <Icon name="check" className="h-4 w-4" /> Phòng này đang được gắn
                  </span>
                ) : null}
                {request.listingMode === "LINKED" ? (
                  <Button
                    variant="outline"
                    pending={pendingAction === "unlink"}
                    pendingLabel="Đang gỡ…"
                    onClick={() => void unlink()}
                  >
                    Gỡ phòng đã chọn
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
          {error ? (
            <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
              {error}
            </p>
          ) : null}
        </Card>
      ) : null}
      <Dialog
        open={confirmListingReplacement}
        title="Thay phòng đang cân nhắc?"
        description="Phòng mới sẽ thay phòng đang gắn với nhu cầu ở ghép của bạn."
        onClose={closeListingReplacement}
        className="sm:max-w-2xl"
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
            <Button
              className="w-full sm:w-auto"
              variant="secondary"
              disabled={pendingAction === "link"}
              onClick={closeListingReplacement}
            >
              Giữ phòng hiện tại
            </Button>
            <Button
              className="w-full sm:w-auto"
              pending={pendingAction === "link"}
              pendingLabel="Đang thay phòng…"
              onClick={() => void persistListingLink()}
            >
              Thay phòng này
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <section
              className="min-w-0 rounded-card border border-border bg-surface-subtle p-4"
              aria-label="Phòng hiện tại"
            >
              <p className="flex items-center gap-2 text-ui-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Icon name="home" className="h-4 w-4 shrink-0" /> Phòng hiện tại
              </p>
              <h3 className="mt-2 line-clamp-2 break-words text-ui-sm font-bold text-foreground">
                {request.listing?.title ?? "Tin phòng đã gắn"}
              </h3>
              {request.listing ? (
                <>
                  <p className="mt-2 break-words text-ui-xs leading-5 text-muted-foreground">
                    {formatAreaLabel(request.listing.areaName)}
                  </p>
                  <p className="mt-1 text-ui-xs font-semibold text-foreground">
                    {formatRoommateMoney(request.listing.monthlyRent)} / tháng
                    <span className="font-normal text-muted-foreground">
                      {` · tối đa ${request.listing.maxOccupants ?? "—"} người`}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-ui-xs leading-5 text-muted-foreground">
                  Thông tin chi tiết của tin phòng cũ hiện không còn hiển thị.
                </p>
              )}
              {request.signals.listingCurrentlyAvailable === false ? (
                <p className="mt-2 text-ui-xs font-semibold text-warning-foreground">
                  Tin phòng hiện không còn khả dụng
                </p>
              ) : null}
            </section>

            <div className="flex justify-center text-primary" aria-hidden="true">
              <Icon name="arrow" className="h-5 w-5 rotate-90 sm:rotate-0" />
            </div>

            <section
              className="min-w-0 rounded-card border border-primary/30 bg-primary-subtle p-4"
              aria-label="Phòng mới sẽ gắn"
            >
              <p className="flex items-center gap-2 text-ui-xs font-bold uppercase tracking-wide text-primary-hover">
                <Icon name="home" className="h-4 w-4 shrink-0" /> Phòng mới sẽ gắn
              </p>
              {selectedListing ? (
                <>
                  <h3 className="mt-2 line-clamp-2 break-words text-ui-sm font-bold text-foreground">
                    {selectedListing.title}
                  </h3>
                  <p className="mt-2 break-words text-ui-xs leading-5 text-muted-foreground">
                    {formatAreaLabel(selectedListing.areaName)}
                  </p>
                  <p className="mt-1 text-ui-xs font-semibold text-foreground">
                    {formatRoommateMoney(selectedListing.monthlyRent)} / tháng
                    <span className="font-normal text-muted-foreground">
                      {` · tối đa ${selectedListing.maxOccupants ?? "—"} người`}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-ui-xs text-muted-foreground">Bạn chưa chọn phòng mới.</p>
              )}
            </section>
          </div>

          <p className="rm-roommate-callout text-ui-sm leading-6" data-tone="info">
            Chỉ tin phòng được gắn thay đổi; ngân sách, khu vực và ghi chú trong nhu cầu của bạn vẫn giữ nguyên.
          </p>
          {error ? (
            <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
      <Dialog
        open={confirmCancel}
        title="Đóng nhu cầu ở ghép?"
        description="Việc đóng nhu cầu sẽ kết thúc các lời quan tâm đang chờ và không thể mở lại nội dung này."
        onClose={() => setConfirmCancel(false)}
      >
        <div className="space-y-4">
          <div className="rm-roommate-callout" data-tone="danger">
            <p className="text-ui-sm font-semibold leading-6 text-foreground">
              Nếu muốn tìm tiếp, bạn cần đăng nhu cầu mới. Các lời quan tâm cũ sẽ không được khôi phục.
            </p>
          </div>
          {error ? (
            <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              autoFocus
              variant="danger"
              pending={pendingAction === "cancel"}
              pendingLabel="Đang đóng…"
              onClick={() => void cancel()}
            >
              Xác nhận đóng nhu cầu
            </Button>
            <Button variant="secondary" disabled={pendingAction === "cancel"} onClick={() => setConfirmCancel(false)}>
              Giữ nhu cầu
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function RequestWorkspace() {
  const { status: authStatus, user } = useAuth();
  const searchParams = useSearchParams();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [requests, setRequests] = useState<readonly RoommateRequest[]>([]);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [hasActiveConnection, setHasActiveConnection] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [feedback, setFeedback] = useState<RequestFeedback | null>(null);
  const requestedListingId = Number(searchParams.get("listingId"));
  const initialListingId =
    Number.isSafeInteger(requestedListingId) && requestedListingId > 0 ? requestedListingId : null;

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    setProfileReady(null);
    setHasActiveConnection(null);
    const connectionPromise = api.roommates.getCurrentConnection(controller.signal).catch((caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 404) return null;
      throw caught;
    });
    void Promise.all([
      api.roommates.listMine({ page: 1, pageSize: 20 }, controller.signal),
      api.roommates.getProfile(controller.signal),
      connectionPromise
    ])
      .then(([requestPage, profile, connection]) => {
        if (controller.signal.aborted) return;
        setRequests(requestPage.data);
        setProfileReady(profile.profileCompleted);
        setHasActiveConnection(connection !== null);
        setState("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = caught instanceof ApiError ? caught : null;
        if (apiError?.status === 404) {
          setProfileReady(false);
          setState("success");
          return;
        }
        setError(apiError);
        setState("error");
      });
    return () => controller.abort();
  }, [refreshKey, tenantReady]);

  const managed =
    requests.find((request) => request.status === "OPEN") ??
    (hasActiveConnection ? requests.find((request) => request.status === "MATCHED") : null) ??
    requests.find((request) => request.status === "EXPIRED") ??
    null;
  const updateRequest = (updated: RoommateRequest, kind: RequestFeedbackKind) => {
    setRequests((items) => {
      const next = items.some((item) => item.id === updated.id)
        ? items.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...items];
      return next;
    });
    setFeedback({ request: updated, kind });
  };

  if (state === "idle" || state === "loading") return <LoadingState message="Đang tải nhu cầu ở ghép…" />;
  if (state === "error") {
    return (
      <ErrorState
        message={roommateErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRefreshKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  }

  return (
    <div className={`rm-roommate-page space-y-6 ${styles.page}`}>
      <RoommatePageHeader
        title="Nhu cầu ở ghép của tôi"
        description="Chia sẻ khu vực, ngân sách và thời gian chuyển vào để gặp đúng người cùng nhà."
        action={
          <Link className={styles.profileLink} href="/roommates/profile">
            <Icon name="users" className="h-4 w-4" /> Hồ sơ ở ghép của tôi
          </Link>
        }
      />
      {profileReady === false ? (
        <EmptyState
          title="Hoàn thành hồ sơ trước khi đăng nhu cầu"
          description="Bạn cần có hồ sơ ở ghép đầy đủ trước khi đăng nhu cầu hoặc bày tỏ quan tâm với người khác."
          action={
            <Link
              className="font-bold underline decoration-2 underline-offset-4"
              href={`/roommates/profile${initialListingId ? `?next=/roommates/my-request?listingId=${initialListingId}` : ""}`}
            >
              Thiết lập hồ sơ ở ghép
            </Link>
          }
        />
      ) : (
        <>
          {feedback ? (
            <section
              role="status"
              className="rm-roommate-callout text-ui-sm font-semibold text-primary-hover"
              data-tone="accent"
            >
              <p>{requestFeedbackMessages[feedback.kind]}</p>
              {feedback.kind === "created" && feedback.request.listingMode === "LINKED" ? (
                <p className="mt-2">{roommateSafetyCopy.linkedMeaning}</p>
              ) : null}
            </section>
          ) : null}
          {managed ? (
            <ManagedRequest request={managed} initialListingId={initialListingId} onChanged={updateRequest} />
          ) : (
            <CreateRequestForm
              initialListingId={initialListingId}
              onCreated={(request) => updateRequest(request, "created")}
            />
          )}
        </>
      )}
      {requests.filter((request) => request.id !== managed?.id).length > 0 ? (
        <section className="space-y-3" aria-labelledby="roommate-request-history-heading">
          <p className="rm-roommate-section-label">Lịch sử</p>
          <h2 id="roommate-request-history-heading" className="font-display text-heading-md font-bold text-foreground">
            Lịch sử nhu cầu
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {requests
              .filter((request) => request.id !== managed?.id)
              .map((request) => (
                <Card
                  key={request.id}
                  className="rm-roommate-card-static flex flex-wrap items-start justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold text-foreground">{roommateRequestStatusLabels[request.status]}</p>
                    <p className="mt-1 text-ui-xs text-muted-foreground">
                      Cập nhật {formatRoommateDateTime(request.updatedAt)}
                    </p>
                  </div>
                  <Link
                    className="inline-flex min-h-11 items-center text-ui-sm font-bold text-primary-hover underline decoration-2 underline-offset-4"
                    href={`/roommates/requests/${request.id}`}
                  >
                    Xem chi tiết
                  </Link>
                </Card>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function RoommateRequestPage() {
  return (
    <RoommateTenantBoundary>
      <RequestWorkspace />
    </RoommateTenantBoundary>
  );
}

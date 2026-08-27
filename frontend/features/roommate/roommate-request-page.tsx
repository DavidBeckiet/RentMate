"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { InputField, TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { PublicListingSummary, RoommateRequest } from "../../types/api";
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
  RoommateListingContext,
  RoommatePageHeader,
  RoommateRequestFacts,
  RoommateSafetyNotice,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";

interface RequestFormValues {
  readonly areas: string;
  readonly budgetMinPerPerson: string;
  readonly budgetMaxPerPerson: string;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly note: string;
}

interface SelectedListing {
  readonly id: number;
  readonly title: string;
  readonly areaName: string;
  readonly monthlyRent: number;
  readonly maxOccupants: number | null;
  readonly businessStatus: "AVAILABLE" | "PAUSED" | "RENTED" | "UNKNOWN";
}

type RequestFeedbackKind = "created" | "updated" | "linked" | "unlinked" | "cancelled" | "renewed";

interface RequestFeedback {
  readonly request: RoommateRequest;
  readonly kind: RequestFeedbackKind;
}

const requestFeedbackMessages: Record<RequestFeedbackKind, string> = {
  created: "Yêu cầu đã được tạo.",
  updated: "Đã lưu thay đổi của yêu cầu.",
  linked: "Đã liên kết listing đã chọn.",
  unlinked: "Đã gỡ liên kết listing. Yêu cầu hiện tiếp tục theo bối cảnh cùng tìm listing.",
  cancelled: "Yêu cầu đã được hủy.",
  renewed: "Yêu cầu đã được gia hạn thêm 30 ngày. Các lời quan tâm cũ không được khôi phục."
};

function defaultValues(): RequestFormValues {
  const from = dayInputValue();
  return {
    areas: "",
    budgetMinPerPerson: "",
    budgetMaxPerPerson: "",
    moveInFrom: from,
    moveInUntil: addDays(from, 30),
    note: ""
  };
}

function valuesFromRequest(request: RoommateRequest): RequestFormValues {
  return {
    areas: request.preferredAreaKeys.join(", "),
    budgetMinPerPerson: String(request.budgetMinPerPerson),
    budgetMaxPerPerson: String(request.budgetMaxPerPerson),
    moveInFrom: request.moveInFrom,
    moveInUntil: request.moveInUntil,
    note: request.note ?? ""
  };
}

function selectedFromSummary(listing: PublicListingSummary): SelectedListing {
  return {
    id: listing.id,
    title: listing.title,
    areaName: listing.areaName,
    monthlyRent: listing.monthlyRent,
    maxOccupants: listing.maxOccupants,
    businessStatus: listing.businessStatus
  };
}

function selectedFromDetail(listing: Awaited<ReturnType<typeof api.listings.getPublicDetail>>): SelectedListing {
  return {
    id: listing.id,
    title: listing.title,
    areaName: listing.areaName,
    monthlyRent: listing.monthlyRent,
    maxOccupants: listing.maxOccupants,
    businessStatus: listing.businessStatus
  };
}

function isEligibleListing(listing: SelectedListing): boolean {
  return (
    listing.maxOccupants !== null &&
    listing.maxOccupants >= 2 &&
    (listing.businessStatus === "AVAILABLE" || listing.businessStatus === "UNKNOWN")
  );
}

function ListingPicker({
  selected,
  onSelect
}: Readonly<{
  selected: SelectedListing | null;
  onSelect: (listing: SelectedListing | null) => void;
}>) {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<readonly PublicListingSummary[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setState("loading");
    setError(null);
    try {
      const page = await api.listings.searchPublic({
        ...(keyword.trim() ? { q: keyword.trim() } : {}),
        minOccupants: 2,
        page: 1,
        pageSize: 12,
        sort: "newest"
      });
      setItems(page.data.filter((listing) => listing.maxOccupants !== null && listing.maxOccupants >= 2));
      setState("success");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
      setState("error");
    }
  };

  return (
    <section
      className="space-y-4 border-2 border-heroDark-950 bg-rent-canvas p-4"
      aria-labelledby="roommate-listing-picker-title"
    >
      <div>
        <h3 id="roommate-listing-picker-title" className="font-display text-ui-base font-bold">
          Chọn listing công khai
        </h3>
        <p className="mt-1 text-ui-sm leading-6 text-rent-secondary">
          Chỉ các listing công khai có sức chứa từ 2 người được đưa vào danh sách. Điều kiện luôn được máy chủ kiểm tra
          lại khi tạo hoặc liên kết yêu cầu.
        </p>
      </div>
      {selected ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-2 border-heroDark-950 bg-rent-surface p-3">
          <div>
            <p className="font-semibold">{selected.title}</p>
            <p className="mt-1 text-ui-sm text-rent-secondary">
              {selected.areaName} · {formatRoommateMoney(selected.monthlyRent)} / tháng · tối đa {selected.maxOccupants}{" "}
              người
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
            Bỏ chọn
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="roommate-listing-search">
          Tìm listing công khai
        </label>
        <input
          id="roommate-listing-search"
          value={keyword}
          maxLength={120}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void search();
          }}
          placeholder="Tìm theo tiêu đề hoặc khu vực"
          className="min-h-11 min-w-0 flex-1 border-2 border-heroDark-950 bg-white px-3 text-ui-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/40"
        />
        <Button pending={state === "loading"} pendingLabel="Đang tìm…" onClick={() => void search()}>
          <Icon name="search" className="h-4 w-4" /> Tìm listing
        </Button>
      </div>
      {state === "error" && error ? (
        <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
      {state === "success" && items.length === 0 ? (
        <p className="text-ui-sm text-rent-secondary">Không có listing công khai phù hợp.</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Kết quả listing công khai">
          {items.map((listing) => (
            <li key={listing.id} className="border-2 border-heroDark-950 bg-rent-surface p-3">
              <p className="font-semibold">{listing.title}</p>
              <p className="mt-1 text-ui-xs leading-5 text-rent-secondary">{listing.areaName}</p>
              <p className="mt-2 text-ui-sm font-bold">{formatRoommateMoney(listing.monthlyRent)} / tháng</p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                size="sm"
                onClick={() => onSelect(selectedFromSummary(listing))}
              >
                Chọn listing này
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
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
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <InputField
          id="roommate-request-areas"
          name="areas"
          label="Khu vực quan tâm"
          hint={
            requireArea
              ? "Nhập từ 1 đến 5 khu vực, ngăn cách bằng dấu phẩy."
              : "Tùy chọn khi đã gắn listing, tối đa 5 khu vực."
          }
          required={requireArea}
          value={values.areas}
          maxLength={600}
          onChange={(event) => onChange({ ...values, areas: event.target.value })}
        />
      </div>
      <InputField
        id="roommate-request-budget-min"
        name="budgetMinPerPerson"
        label="Ngân sách tối thiểu mỗi người"
        hint="Nhập số tiền bằng VND."
        required
        type="number"
        min="1"
        inputMode="numeric"
        value={values.budgetMinPerPerson}
        onChange={(event) => onChange({ ...values, budgetMinPerPerson: event.target.value })}
      />
      <InputField
        id="roommate-request-budget-max"
        name="budgetMaxPerPerson"
        label="Ngân sách tối đa mỗi người"
        hint="Nhập số tiền bằng VND."
        required
        type="number"
        min="1"
        inputMode="numeric"
        value={values.budgetMaxPerPerson}
        onChange={(event) => onChange({ ...values, budgetMaxPerPerson: event.target.value })}
      />
      <InputField
        id="roommate-request-move-in-from"
        name="moveInFrom"
        label="Có thể chuyển vào từ"
        required
        type="date"
        value={values.moveInFrom}
        onChange={(event) => onChange({ ...values, moveInFrom: event.target.value })}
      />
      <InputField
        id="roommate-request-move-in-until"
        name="moveInUntil"
        label="Có thể chuyển vào đến"
        required
        type="date"
        value={values.moveInUntil}
        onChange={(event) => onChange({ ...values, moveInUntil: event.target.value })}
      />
      <div className="sm:col-span-2">
        <TextareaField
          id="roommate-request-note"
          name="note"
          label="Ghi chú thêm"
          hint="Không bắt buộc, tối đa 500 ký tự. Không chia sẻ thông tin liên hệ hoặc tài chính."
          maxLength={500}
          rows={4}
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
  const [selectedListing, setSelectedListing] = useState<SelectedListing | null>(null);
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
        const candidate = selectedFromDetail(listing);
        if (!isEligibleListing(candidate)) {
          setListingError("Listing này hiện không đủ điều kiện để tạo yêu cầu ở ghép.");
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
      setError("Hãy nhập ít nhất một khu vực quan tâm cho yêu cầu chưa gắn listing.");
      return;
    }
    if (mode === "LINKED" && !selectedListing) {
      setError("Hãy chọn một listing công khai phù hợp trước khi tạo yêu cầu.");
      return;
    }
    if (!values.budgetMinPerPerson || !values.budgetMaxPerPerson || !values.moveInFrom || !values.moveInUntil) {
      setError("Hãy điền ngân sách và khoảng thời gian chuyển vào.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const request = await api.roommates.createRequest({
        listingId: mode === "LINKED" ? (selectedListing?.id ?? null) : null,
        preferredAreaKeys: areas,
        budgetMinPerPerson: Number(values.budgetMinPerPerson),
        budgetMaxPerPerson: Number(values.budgetMaxPerPerson),
        moveInFrom: values.moveInFrom,
        moveInUntil: values.moveInUntil,
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
    <Card className="space-y-5">
      <div>
        <h2 className="font-display text-heading-sm font-bold">Tạo yêu cầu tìm người ở ghép</h2>
        <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
          Chọn một trong hai bối cảnh. Liên kết listing chỉ là ngữ cảnh để cùng cân nhắc thuê, không xác nhận quyền
          thuê, sự đồng ý của người cho thuê hoặc việc giữ chỗ.
        </p>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="text-ui-sm font-bold">Bạn muốn bắt đầu như thế nào?</legend>
        <button
          type="button"
          aria-pressed={mode === "UNLINKED"}
          onClick={() => setMode("UNLINKED")}
          className={`min-h-24 border-2 border-heroDark-950 p-4 text-left text-ui-sm transition-colors ${mode === "UNLINKED" ? "bg-rent-accent" : "bg-rent-surface hover:bg-rent-canvas"}`}
        >
          <strong className="block">Cùng tìm listing</strong>
          <span className="mt-1 block text-rent-secondary">
            Bắt đầu bằng khu vực, ngân sách và thời gian chuyển vào.
          </span>
        </button>
        <button
          type="button"
          aria-pressed={mode === "LINKED"}
          onClick={() => setMode("LINKED")}
          className={`min-h-24 border-2 border-heroDark-950 p-4 text-left text-ui-sm transition-colors ${mode === "LINKED" ? "bg-rent-accent" : "bg-rent-surface hover:bg-rent-canvas"}`}
        >
          <strong className="block">Cân nhắc một listing</strong>
          <span className="mt-1 block text-rent-secondary">Chọn một listing công khai có sức chứa từ 2 người.</span>
        </button>
      </fieldset>
      <form className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
        {mode === "LINKED" ? (
          <>
            {listingLoadState === "loading" ? <LoadingState message="Đang kiểm tra listing đã chọn…" /> : null}
            {listingError ? (
              <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
                {listingError}
              </p>
            ) : null}
            <ListingPicker selected={selectedListing} onSelect={setSelectedListing} />
          </>
        ) : null}
        <RequestFields values={values} onChange={setValues} requireArea={mode === "UNLINKED"} />
        {error ? (
          <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}
        <RoommateSafetyNotice kind="long" />
        <Button className="w-full sm:w-auto" type="submit" pending={pending} pendingLabel="Đang tạo yêu cầu…">
          Tạo yêu cầu
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
  const [selectedListing, setSelectedListing] = useState<SelectedListing | null>(() =>
    request.listing ? selectedFromSummary(request.listing) : null
  );
  const [ctaListingState, setCtaListingState] = useState<"idle" | "loading" | "error">("idle");
  const [ctaListingError, setCtaListingError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "link" | "unlink" | "cancel" | "renew" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setValues(valuesFromRequest(request));
    setSelectedListing(request.listing ? selectedFromSummary(request.listing) : null);
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
        const candidate = selectedFromDetail(listing);
        if (!isEligibleListing(candidate)) {
          setCtaListingError("Listing này hiện không còn đủ điều kiện để liên kết với yêu cầu ở ghép.");
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
    setPendingAction("save");
    setError(null);
    try {
      const updated = await api.roommates.updateRequest(request.id, {
        preferredAreaKeys: parseAreaKeys(values.areas),
        budgetMinPerPerson: Number(values.budgetMinPerPerson),
        budgetMaxPerPerson: Number(values.budgetMaxPerPerson),
        moveInFrom: values.moveInFrom,
        moveInUntil: values.moveInUntil,
        note: values.note.trim() || null
      });
      onChanged(updated, "updated");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const link = async () => {
    if (!selectedListing) {
      setError("Hãy chọn một listing công khai trước khi liên kết.");
      return;
    }
    setPendingAction("link");
    setError(null);
    try {
      onChanged(await api.roommates.linkListing(request.id, selectedListing.id), "linked");
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const unlink = async () => {
    if (request.preferredAreaKeys.length === 0) {
      setError("Hãy lưu ít nhất một khu vực quan tâm trước khi gỡ liên kết listing.");
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
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-ui-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">YÊU CẦU CỦA BẠN</p>
            <h2 className="mt-1 font-display text-heading-sm font-bold">
              {roommateRequestStatusLabels[request.status]}
            </h2>
            <p className="mt-2 text-ui-sm text-rent-secondary">
              Hết hạn lúc {formatRoommateDateTime(request.expiresAt)}
            </p>
            {expiringSoon ? (
              <p role="status" className="mt-2 border-l-4 border-heroDark-950 pl-3 text-ui-sm font-semibold">
                Yêu cầu sắp hết hạn trong vòng 3 ngày. Sau khi hết hạn, bạn có thể gia hạn để bắt đầu chu kỳ 30 ngày
                mới.
              </p>
            ) : null}
          </div>
          <Link
            href={`/roommates/requests/${request.id}`}
            className="text-ui-sm font-bold underline decoration-2 underline-offset-4"
          >
            Xem chi tiết
          </Link>
        </div>
        <RoommateRequestFacts request={request} />
        <RoommateListingContext request={request} />
        {request.status === "OPEN" && request.signals.listingCurrentlyAvailable === false ? (
          <RoommateSafetyNotice kind="long" />
        ) : null}
        {request.status === "MATCHED" ? (
          <Link
            className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-heroDark-950 px-4 text-ui-sm font-bold text-white shadow-glass-sm"
            href="/roommates/connection"
          >
            Mở kết nối hiện tại
          </Link>
        ) : null}
        {request.status === "EXPIRED" ? (
          <div className="space-y-3 border-t-2 border-heroDark-950 pt-4">
            <p className="text-ui-sm leading-6 text-rent-secondary">
              Gia hạn sẽ tạo chu kỳ 30 ngày mới và không khôi phục các lời quan tâm cũ.
            </p>
            <Button pending={pendingAction === "renew"} pendingLabel="Đang gia hạn…" onClick={() => void renew()}>
              <Icon name="refresh" className="h-4 w-4" /> Gia hạn yêu cầu
            </Button>
          </div>
        ) : null}
      </Card>

      {editable ? (
        <Card className="space-y-5">
          <div>
            <h2 className="font-display text-heading-sm font-bold">Chỉnh sửa yêu cầu</h2>
            <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
              Chỉ sửa nội dung khi yêu cầu đang mở. Việc gắn hoặc gỡ listing dùng thao tác riêng bên dưới.
            </p>
          </div>
          <RequestFields values={values} onChange={setValues} requireArea={request.listingMode === "UNLINKED"} />
          <Button
            className="w-full sm:w-auto"
            pending={pendingAction === "save"}
            pendingLabel="Đang lưu…"
            onClick={() => void update()}
          >
            Lưu thay đổi
          </Button>
          <section
            className="space-y-4 border-t-2 border-heroDark-950 pt-5"
            aria-labelledby="roommate-link-listing-heading"
          >
            <div>
              <h3 id="roommate-link-listing-heading" className="font-display text-ui-base font-bold">
                Liên kết listing
              </h3>
              <p className="mt-1 text-ui-sm leading-6 text-rent-secondary">
                Liên kết listing chỉ là ngữ cảnh để cùng cân nhắc thuê.
              </p>
            </div>
            {ctaListingState === "loading" ? <LoadingState message="Đang kiểm tra listing đã chọn…" /> : null}
            {ctaListingError ? (
              <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
                {ctaListingError}
              </p>
            ) : null}
            {initialListingId && selectedListing?.id === initialListingId ? (
              <p role="status" className="border-l-4 border-heroDark-950 pl-3 text-ui-sm font-semibold">
                Listing từ trang chi tiết đã được chọn. Hãy kiểm tra lại rồi xác nhận liên kết; listing chỉ là ngữ cảnh
                để cùng cân nhắc thuê.
              </p>
            ) : null}
            <ListingPicker selected={selectedListing} onSelect={setSelectedListing} />
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button pending={pendingAction === "link"} pendingLabel="Đang liên kết…" onClick={() => void link()}>
                Liên kết listing đã chọn
              </Button>
              {request.listingMode === "LINKED" ? (
                <Button
                  variant="outline"
                  pending={pendingAction === "unlink"}
                  pendingLabel="Đang gỡ…"
                  onClick={() => void unlink()}
                >
                  Gỡ liên kết listing
                </Button>
              ) : null}
            </div>
          </section>
          <section className="space-y-3 border-t-2 border-heroDark-950 pt-5" aria-label="Hủy yêu cầu ở ghép">
            {confirmCancel ? (
              <div className="space-y-3 border-2 border-heroDark-950 bg-rent-coral p-4">
                <p className="text-ui-sm font-semibold">
                  Hủy yêu cầu sẽ từ chối các lời quan tâm đang chờ và không thể mở lại yêu cầu này.
                </p>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <Button
                    autoFocus
                    variant="danger"
                    pending={pendingAction === "cancel"}
                    pendingLabel="Đang hủy…"
                    onClick={() => void cancel()}
                  >
                    Xác nhận hủy yêu cầu
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pendingAction === "cancel"}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Giữ lại
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                Hủy yêu cầu
              </Button>
            )}
          </section>
          {error ? (
            <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
              {error}
            </p>
          ) : null}
        </Card>
      ) : null}
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

  if (state === "idle" || state === "loading") return <LoadingState message="Đang tải yêu cầu ở ghép…" />;
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
    <div className="space-y-6">
      <RoommatePageHeader
        title="Yêu cầu ở ghép của tôi"
        description="Tạo, cập nhật hoặc quản lý một yêu cầu đang mở. Mỗi người chỉ có một yêu cầu đang mở tại cùng thời điểm."
      />
      <RoommateSubnav />
      {profileReady === false ? (
        <EmptyState
          title="Hoàn thành hồ sơ trước khi tạo yêu cầu"
          description="Bạn cần có hồ sơ ở ghép đầy đủ và khả dụng trước khi tạo yêu cầu hoặc gửi lời quan tâm."
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
              className="border-2 border-heroDark-950 bg-rent-accent p-4 text-ui-sm font-semibold shadow-glass-sm"
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
          <h2 id="roommate-request-history-heading" className="font-display text-heading-sm font-bold">
            Lịch sử yêu cầu
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {requests
              .filter((request) => request.id !== managed?.id)
              .map((request) => (
                <Card key={request.id} className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{roommateRequestStatusLabels[request.status]}</p>
                    <p className="mt-1 text-ui-xs text-rent-secondary">
                      Cập nhật {formatRoommateDateTime(request.updatedAt)}
                    </p>
                  </div>
                  <Link
                    className="text-ui-sm font-bold underline decoration-2 underline-offset-4"
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

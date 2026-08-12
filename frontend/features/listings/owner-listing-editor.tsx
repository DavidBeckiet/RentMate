"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import {
  CheckboxField,
  CheckboxGroup,
  InputField,
  SelectField,
  TextareaField
} from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import type { Amenity, ListingContentBody, OwnerListingDetail, PropertyType } from "../../types/api";

export type LookupResource<Value> =
  | { readonly status: "loading"; readonly data: readonly Value[] }
  | { readonly status: "success"; readonly data: readonly Value[] }
  | { readonly status: "error"; readonly data: readonly Value[] };

export const ownerEditorFields = [
  "title",
  "description",
  "monthlyRent",
  "propertyTypeCode",
  "roomAreaSqm",
  "addressText",
  "areaName",
  "latitude",
  "longitude",
  "amenityCodes"
] as const;

export type OwnerEditorField = (typeof ownerEditorFields)[number];

export interface OwnerEditorFeedback {
  readonly fieldErrors: Partial<Record<OwnerEditorField, string>>;
  readonly formMessage: string | null;
  readonly requestId: string | null;
}

interface OwnerListingEditorProps {
  readonly detail: OwnerListingDetail;
  readonly propertyTypes: LookupResource<PropertyType>;
  readonly amenities: LookupResource<Amenity>;
  readonly externalFeedback: OwnerEditorFeedback | null;
  readonly onDetailChange: (detail: OwnerListingDetail) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onEdit: () => void;
  readonly onRetryPropertyTypes: () => void;
  readonly onRetryAmenities: () => void;
}

interface FormState {
  readonly title: string;
  readonly description: string;
  readonly monthlyRent: string;
  readonly propertyTypeCode: string;
  readonly roomAreaSqm: string;
  readonly addressText: string;
  readonly areaName: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly amenityCodes: readonly string[];
}

interface SaveFeedback extends OwnerEditorFeedback {
  readonly success: string | null;
}

const emptyFeedback: SaveFeedback = { fieldErrors: {}, formMessage: null, requestId: null, success: null };

function formFromDetail(detail: OwnerListingDetail): FormState {
  return {
    title: detail.title ?? "",
    description: detail.description ?? "",
    monthlyRent: detail.monthlyRent === null ? "" : String(detail.monthlyRent),
    propertyTypeCode: detail.propertyType?.code ?? "",
    roomAreaSqm: detail.roomAreaSqm === null ? "" : String(detail.roomAreaSqm),
    addressText: detail.addressText ?? "",
    areaName: detail.areaName ?? "",
    latitude: detail.latitude === null ? "" : String(detail.latitude),
    longitude: detail.longitude === null ? "" : String(detail.longitude),
    amenityCodes: detail.amenities.map((amenity) => amenity.code)
  };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function nullableString(value: string): string | null {
  return value.trim() || null;
}

function parseNumber(
  value: string,
  field: OwnerEditorField,
  options: {
    readonly integer?: boolean;
    readonly minimumExclusive?: number;
    readonly maximum: number;
    readonly decimals?: number;
  },
  errors: Partial<Record<OwnerEditorField, string>>
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  const decimalPattern =
    options.decimals === undefined ? null : new RegExp(`^-?[0-9]+(?:\\.[0-9]{1,${options.decimals}})?$`);
  if (
    !Number.isFinite(number) ||
    (options.integer && !Number.isInteger(number)) ||
    (options.minimumExclusive !== undefined && number <= options.minimumExclusive) ||
    number > options.maximum ||
    (decimalPattern && !decimalPattern.test(trimmed))
  ) {
    errors[field] =
      field === "monthlyRent"
        ? "Giá thuê phải là số nguyên dương không lớn hơn 999999999999."
        : "Diện tích phải là số dương, tối đa hai chữ số thập phân và không lớn hơn 999999.99.";
  }
  return number;
}

function parseCoordinate(
  value: string,
  field: "latitude" | "longitude",
  minimum: number,
  maximum: number,
  errors: Partial<Record<OwnerEditorField, string>>
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    errors[field] =
      field === "latitude" ? "Vĩ độ phải nằm trong khoảng -90 đến 90." : "Kinh độ phải nằm trong khoảng -180 đến 180.";
  }
  return number;
}

type MutableListingContentBody = { -readonly [Key in keyof ListingContentBody]: ListingContentBody[Key] };

function buildPatch(form: FormState, dirty: ReadonlySet<OwnerEditorField>) {
  const errors: Partial<Record<OwnerEditorField, string>> = {};
  const body: Partial<MutableListingContentBody> = {};

  for (const field of ["title", "description", "addressText", "areaName"] as const) {
    if (dirty.has(field)) body[field] = nullableString(form[field]);
  }
  if (dirty.has("propertyTypeCode")) body.propertyTypeCode = nullableString(form.propertyTypeCode);
  if (dirty.has("monthlyRent")) {
    body.monthlyRent = parseNumber(
      form.monthlyRent,
      "monthlyRent",
      { integer: true, minimumExclusive: 0, maximum: 999_999_999_999 },
      errors
    );
  }
  if (dirty.has("roomAreaSqm")) {
    body.roomAreaSqm = parseNumber(
      form.roomAreaSqm,
      "roomAreaSqm",
      { minimumExclusive: 0, maximum: 999_999.99, decimals: 2 },
      errors
    );
  }
  if (dirty.has("latitude") || dirty.has("longitude")) {
    const latitude = parseCoordinate(form.latitude, "latitude", -90, 90, errors);
    const longitude = parseCoordinate(form.longitude, "longitude", -180, 180, errors);
    if ((latitude === null) !== (longitude === null)) {
      errors.latitude ??= "Vĩ độ và kinh độ phải được nhập hoặc để trống cùng nhau.";
      errors.longitude ??= "Vĩ độ và kinh độ phải được nhập hoặc để trống cùng nhau.";
    }
    body.latitude = latitude;
    body.longitude = longitude;
  }
  if (dirty.has("amenityCodes")) body.amenityCodes = [...form.amenityCodes];

  return { body: body as ListingContentBody, errors };
}

function sameCanonicalContent(left: OwnerListingDetail, right: OwnerListingDetail): boolean {
  return (
    left.id === right.id &&
    left.status === right.status &&
    left.title === right.title &&
    left.description === right.description &&
    left.monthlyRent === right.monthlyRent &&
    left.roomAreaSqm === right.roomAreaSqm &&
    left.addressText === right.addressText &&
    left.areaName === right.areaName &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.propertyType?.code === right.propertyType?.code &&
    sameSet(
      left.amenities.map((amenity) => amenity.code),
      right.amenities.map((amenity) => amenity.code)
    ) &&
    left.updatedAt === right.updatedAt
  );
}

function saveError(error: unknown): SaveFeedback {
  if (!(error instanceof ApiError)) {
    return { ...emptyFeedback, formMessage: "Không thể lưu thay đổi lúc này. Vui lòng thử lại sau." };
  }
  if (error.status === 401) {
    return { ...emptyFeedback, formMessage: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." };
  }
  if (error.status === 403) {
    return { ...emptyFeedback, formMessage: "Bạn không có quyền chỉnh sửa tin này.", requestId: error.requestId };
  }
  if (error.status === 404) {
    return { ...emptyFeedback, formMessage: "Tin đăng không tồn tại hoặc bạn không thể truy cập." };
  }
  if (error.status === 409) {
    return {
      ...emptyFeedback,
      formMessage: "Tin đã thay đổi. Hãy tải lại tin trước khi tiếp tục.",
      requestId: error.requestId
    };
  }
  if (error.code === "NETWORK_ERROR") {
    return {
      ...emptyFeedback,
      formMessage: "Không thể xác nhận việc lưu thay đổi. Hãy tải lại tin để kiểm tra trước khi thử lại."
    };
  }
  const mapped = mapApiErrorToFields(error, ownerEditorFields);
  return { ...mapped, success: null };
}

function statusWarning(status: OwnerListingDetail["status"]): string | null {
  if (status === "APPROVED") return "Chỉnh sửa nội dung thực sự sẽ đưa tin về trạng thái chờ duyệt.";
  if (status === "INACTIVE")
    return "Chỉnh sửa nội dung thực sự sẽ đưa tin về chờ duyệt thay vì kích hoạt lại trực tiếp.";
  if (status === "REJECTED") return "Bạn cần chỉnh sửa tin trước khi có thể gửi duyệt lại.";
  if (status === "HIDDEN") return "Chỉnh sửa không tự công khai hoặc gửi duyệt lại tin.";
  return null;
}

export function OwnerListingEditor({
  detail,
  propertyTypes,
  amenities,
  externalFeedback,
  onDetailChange,
  onDirtyChange,
  onBusyChange,
  onEdit,
  onRetryPropertyTypes,
  onRetryAmenities
}: OwnerListingEditorProps) {
  const { refresh } = useAuth();
  const [form, setForm] = useState<FormState>(() => formFromDetail(detail));
  const [dirtyFields, setDirtyFields] = useState<ReadonlySet<OwnerEditorField>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(emptyFeedback);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const savedDetailRef = useRef<OwnerListingDetail | null>(null);
  const dirty = dirtyFields.size > 0;

  useEffect(() => {
    setForm(formFromDetail(detail));
    setDirtyFields(new Set());
    if (savedDetailRef.current !== detail) setFeedback(emptyFeedback);
    savedDetailRef.current = null;
  }, [detail]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(pending), [onBusyChange, pending]);
  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  const canonicalForm = useMemo(() => formFromDetail(detail), [detail]);
  const activePropertyCodes = useMemo(() => new Set(propertyTypes.data.map((item) => item.code)), [propertyTypes.data]);
  const activeAmenityCodes = useMemo(() => new Set(amenities.data.map((item) => item.code)), [amenities.data]);
  const retainedProperty =
    detail.propertyType && !activePropertyCodes.has(detail.propertyType.code) ? detail.propertyType : null;
  const retainedAmenities = detail.amenities.filter((item) => !activeAmenityCodes.has(item.code));

  const updateField = (field: Exclude<OwnerEditorField, "amenityCodes">, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirtyFields((current) => {
      const next = new Set(current);
      if (value === canonicalForm[field]) next.delete(field);
      else next.add(field);
      return next;
    });
    setFeedback(emptyFeedback);
    onEdit();
  };

  const updateAmenity = (code: string, checked: boolean) => {
    const nextCodes = checked
      ? form.amenityCodes.includes(code)
        ? form.amenityCodes
        : [...form.amenityCodes, code]
      : form.amenityCodes.filter((value) => value !== code);
    setForm((current) => ({ ...current, amenityCodes: nextCodes }));
    setDirtyFields((current) => {
      const next = new Set(current);
      if (sameSet(nextCodes, canonicalForm.amenityCodes)) next.delete("amenityCodes");
      else next.add("amenityCodes");
      return next;
    });
    setFeedback(emptyFeedback);
    onEdit();
  };

  const revert = () => {
    setForm(canonicalForm);
    setDirtyFields(new Set());
    setFeedback(emptyFeedback);
    onEdit();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || !dirty) return;
    const patch = buildPatch(form, dirtyFields);
    if (Object.keys(patch.errors).length > 0) {
      setFeedback({ ...emptyFeedback, fieldErrors: patch.errors });
      return;
    }

    const before = detail;
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setFeedback(emptyFeedback);
    onEdit();

    try {
      const returned = await api.listings.updateOwned(detail.id, patch.body, controller.signal);
      if (controller.signal.aborted) return;
      const noOp = sameCanonicalContent(before, returned);
      savedDetailRef.current = returned;
      onDetailChange(returned);
      setFeedback({ ...emptyFeedback, success: noOp ? "Không có thay đổi cần lưu." : "Đã lưu thay đổi." });
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      setFeedback(saveError(caught));
      if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  const combinedErrors = { ...externalFeedback?.fieldErrors, ...feedback.fieldErrors };
  const warning = statusWarning(detail.status);

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="space-y-8">
      {warning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{warning}</p>
      ) : null}

      <section
        aria-labelledby="owner-basic-heading"
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-6"
      >
        <h2 id="owner-basic-heading" className="text-xl font-semibold text-slate-950">
          Thông tin cơ bản
        </h2>
        <InputField
          id="owner-title"
          name="title"
          label="Tiêu đề"
          maxLength={160}
          value={form.title}
          error={combinedErrors.title}
          disabled={pending}
          onChange={(event) => updateField("title", event.target.value)}
        />
        <TextareaField
          id="owner-description"
          name="description"
          label="Mô tả"
          maxLength={5000}
          value={form.description}
          error={combinedErrors.description}
          disabled={pending}
          onChange={(event) => updateField("description", event.target.value)}
        />
      </section>

      <section
        aria-labelledby="owner-price-heading"
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-6"
      >
        <h2 id="owner-price-heading" className="text-xl font-semibold text-slate-950">
          Giá &amp; diện tích
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            id="owner-rent"
            name="monthlyRent"
            label="Giá thuê mỗi tháng"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={form.monthlyRent}
            error={combinedErrors.monthlyRent}
            disabled={pending}
            onChange={(event) => updateField("monthlyRent", event.target.value)}
          />
          <InputField
            id="owner-area"
            name="roomAreaSqm"
            label="Diện tích (m²)"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={form.roomAreaSqm}
            error={combinedErrors.roomAreaSqm}
            disabled={pending}
            onChange={(event) => updateField("roomAreaSqm", event.target.value)}
          />
        </div>
      </section>

      <section
        aria-labelledby="owner-location-heading"
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-6"
      >
        <h2 id="owner-location-heading" className="text-xl font-semibold text-slate-950">
          Địa chỉ &amp; vị trí
        </h2>
        <InputField
          id="owner-address"
          name="addressText"
          label="Địa chỉ chính xác"
          maxLength={500}
          value={form.addressText}
          error={combinedErrors.addressText}
          disabled={pending}
          onChange={(event) => updateField("addressText", event.target.value)}
        />
        <InputField
          id="owner-area-name"
          name="areaName"
          label="Tên khu vực"
          maxLength={120}
          value={form.areaName}
          error={combinedErrors.areaName}
          disabled={pending}
          onChange={(event) => updateField("areaName", event.target.value)}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            id="owner-latitude"
            name="latitude"
            label="Vĩ độ"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.latitude}
            error={combinedErrors.latitude}
            disabled={pending}
            onChange={(event) => updateField("latitude", event.target.value)}
          />
          <InputField
            id="owner-longitude"
            name="longitude"
            label="Kinh độ"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.longitude}
            error={combinedErrors.longitude}
            disabled={pending}
            onChange={(event) => updateField("longitude", event.target.value)}
          />
        </div>
      </section>

      <section
        aria-labelledby="owner-lookup-heading"
        className="space-y-6 rounded-xl border border-stone-200 bg-white p-6"
      >
        <h2 id="owner-lookup-heading" className="text-xl font-semibold text-slate-950">
          Loại phòng &amp; tiện ích
        </h2>
        <SelectField
          id="owner-property-type"
          name="propertyTypeCode"
          label="Loại phòng"
          value={form.propertyTypeCode}
          error={combinedErrors.propertyTypeCode}
          disabled={pending}
          onChange={(event) => updateField("propertyTypeCode", event.target.value)}
        >
          <option value="">Chưa chọn loại</option>
          {retainedProperty ? (
            <option value={retainedProperty.code} disabled>
              {retainedProperty.label}
              {propertyTypes.status === "success" ? " — không còn cho chọn mới" : " — giá trị hiện tại"}
            </option>
          ) : null}
          {propertyTypes.data.map((propertyType) => (
            <option key={propertyType.code} value={propertyType.code}>
              {propertyType.label}
            </option>
          ))}
        </SelectField>
        {propertyTypes.status === "loading" ? (
          <p role="status" className="text-sm text-slate-600">
            Đang tải loại phòng…
          </p>
        ) : null}
        {propertyTypes.status === "error" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-red-700" role="alert">
            <span>Không thể tải các loại phòng đang cho chọn.</span>
            <Button variant="secondary" onClick={onRetryPropertyTypes}>
              Thử lại loại phòng
            </Button>
          </div>
        ) : null}

        <CheckboxGroup id="owner-amenities" legend="Tiện ích" error={combinedErrors.amenityCodes} disabled={pending}>
          {amenities.data.map((amenity) => (
            <CheckboxField
              key={amenity.code}
              id={`owner-amenity-${amenity.code}`}
              name="amenityCodes"
              label={amenity.label}
              value={amenity.code}
              checked={form.amenityCodes.includes(amenity.code)}
              onChange={(event) => updateAmenity(amenity.code, event.target.checked)}
            />
          ))}
          {retainedAmenities.map((amenity) => (
            <CheckboxField
              key={amenity.code}
              id={`owner-amenity-retired-${amenity.code}`}
              name="amenityCodes"
              label={`${amenity.label}${
                amenities.status === "success" ? " — đang dùng, không còn cho chọn mới" : " — giá trị hiện tại"
              }`}
              value={amenity.code}
              checked={form.amenityCodes.includes(amenity.code)}
              onChange={(event) => updateAmenity(amenity.code, event.target.checked)}
            />
          ))}
          {amenities.status === "success" && amenities.data.length === 0 && retainedAmenities.length === 0 ? (
            <p className="text-sm text-slate-600">Hiện không có tiện ích để chọn.</p>
          ) : null}
        </CheckboxGroup>
        {amenities.status === "loading" ? (
          <p role="status" className="text-sm text-slate-600">
            Đang tải tiện ích…
          </p>
        ) : null}
        {amenities.status === "error" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-red-700" role="alert">
            <span>Không thể tải các tiện ích đang cho chọn.</span>
            <Button variant="secondary" onClick={onRetryAmenities}>
              Thử lại tiện ích
            </Button>
          </div>
        ) : null}
      </section>

      {feedback.formMessage || externalFeedback?.formMessage ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          {feedback.formMessage ?? externalFeedback?.formMessage}
          {feedback.requestId || externalFeedback?.requestId
            ? ` Mã yêu cầu: ${feedback.requestId ?? externalFeedback?.requestId}`
            : ""}
        </p>
      ) : null}
      {feedback.success ? (
        <p aria-live="polite" className="text-sm font-medium text-teal-800">
          {feedback.success}
        </p>
      ) : null}
      {dirty || pending ? (
        <p className="text-sm text-amber-900">Bạn có thay đổi chưa lưu. Hãy lưu hoặc hoàn tác trước.</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending} pendingLabel="Đang lưu…" disabled={!dirty}>
          Lưu thay đổi
        </Button>
        <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={revert}>
          Hoàn tác thay đổi
        </Button>
      </div>
    </form>
  );
}

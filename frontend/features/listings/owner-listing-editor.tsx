"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
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
import { OwnerLocationControls } from "./owner-location-controls";
import styles from "./owner-listing-editor.module.css";

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
  "maxOccupants",
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
  readonly maxOccupants: string;
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

const amenityLabels: Readonly<Record<string, string>> = {
  AIR_CONDITIONING: "Máy lạnh",
  WIFI: "Wi-Fi",
  FURNISHED: "Có nội thất",
  PRIVATE_BATHROOM: "Nhà vệ sinh riêng",
  KITCHEN: "Khu bếp",
  REFRIGERATOR: "Tủ lạnh",
  WASHING_MACHINE: "Máy giặt",
  PARKING: "Chỗ để xe",
  ELEVATOR: "Thang máy",
  SECURITY: "An ninh",
  BALCONY: "Ban công",
  PET_FRIENDLY: "Cho nuôi thú cưng"
};

const propertyTypeLabels: Readonly<Record<string, string>> = {
  ROOM: "Phòng trọ",
  STUDIO: "Studio",
  APARTMENT: "Căn hộ",
  HOUSE: "Nhà nguyên căn",
  DORMITORY: "Ký túc xá"
};

function localizedLabel(code: string, fallback: string, labels: Readonly<Record<string, string>>): string {
  return labels[code] ?? fallback;
}

function formFromDetail(detail: OwnerListingDetail): FormState {
  return {
    title: detail.title ?? "",
    description: detail.description ?? "",
    monthlyRent: detail.monthlyRent === null ? "" : String(detail.monthlyRent),
    propertyTypeCode: detail.propertyType?.code ?? "",
    roomAreaSqm: detail.roomAreaSqm === null ? "" : String(detail.roomAreaSqm),
    maxOccupants: detail.maxOccupants === null ? "" : String(detail.maxOccupants),
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

function currencyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCurrencyInput(value: string): string {
  const digits = currencyDigits(value);
  return digits ? new Intl.NumberFormat("vi-VN").format(Number(digits)) : "";
}

function formatCurrencyHint(value: string): string {
  const amount = Number(currencyDigits(value));
  if (!Number.isFinite(amount) || amount <= 0) return "Nhập giá thuê theo tháng, ví dụ 3.500.000 ₫.";
  if (amount >= 1_000_000) {
    const millions = Math.round((amount / 1_000_000) * 10) / 10;
    return `${formatCurrencyInput(value)} ₫/tháng · khoảng ${String(millions).replace(".", ",")} triệu đồng.`;
  }
  return `${formatCurrencyInput(value)} ₫/tháng.`;
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
        : field === "maxOccupants"
          ? "Sức chứa phải là số nguyên từ 1 đến 20."
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
  if (dirty.has("maxOccupants")) {
    body.maxOccupants = parseNumber(
      form.maxOccupants,
      "maxOccupants",
      { integer: true, minimumExclusive: 0, maximum: 20 },
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
    left.maxOccupants === right.maxOccupants &&
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
  const [locationConfirmed, setLocationConfirmed] = useState(
    () => detail.latitude !== null && detail.longitude !== null
  );
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const savedDetailRef = useRef<OwnerListingDetail | null>(null);
  const dirty = dirtyFields.size > 0;

  useEffect(() => {
    setForm(formFromDetail(detail));
    setDirtyFields(new Set());
    setLocationConfirmed(detail.latitude !== null && detail.longitude !== null);
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
    if (field === "areaName" && form.latitude.trim() && form.longitude.trim()) {
      setLocationConfirmed(
        value === canonicalForm.areaName &&
          form.latitude === canonicalForm.latitude &&
          form.longitude === canonicalForm.longitude
      );
    }
    setFeedback(emptyFeedback);
    onEdit();
  };

  const updateAddress = (value: string) => {
    const restored = value === canonicalForm.addressText;
    const latitude = restored ? canonicalForm.latitude : "";
    const longitude = restored ? canonicalForm.longitude : "";
    setForm((current) => ({ ...current, addressText: value, latitude, longitude }));
    setDirtyFields((current) => {
      const next = new Set(current);
      for (const [field, nextValue] of [
        ["addressText", value],
        ["latitude", latitude],
        ["longitude", longitude]
      ] as const) {
        if (nextValue === canonicalForm[field]) next.delete(field);
        else next.add(field);
      }
      return next;
    });
    setLocationConfirmed(
      restored && canonicalForm.latitude.trim().length > 0 && canonicalForm.longitude.trim().length > 0
    );
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

  const updateCoordinates = (latitude: string, longitude: string) => {
    setForm((current) => ({ ...current, latitude, longitude }));
    setDirtyFields((current) => {
      const next = new Set(current);
      if (latitude === canonicalForm.latitude) next.delete("latitude");
      else next.add("latitude");
      if (longitude === canonicalForm.longitude) next.delete("longitude");
      else next.add("longitude");
      return next;
    });
    setLocationConfirmed(latitude === canonicalForm.latitude && longitude === canonicalForm.longitude);
    setFeedback(emptyFeedback);
    onEdit();
  };

  const updateCurrentLocation = (addressText: string, areaName: string, latitude: string, longitude: string) => {
    const values = { addressText, areaName, latitude, longitude };
    setForm((current) => ({ ...current, ...values }));
    setDirtyFields((current) => {
      const next = new Set(current);
      for (const [field, value] of Object.entries(values) as Array<[keyof typeof values, string]>) {
        if (value === canonicalForm[field]) next.delete(field);
        else next.add(field);
      }
      return next;
    });
    setLocationConfirmed(false);
    setFeedback(emptyFeedback);
    onEdit();
  };

  const revert = () => {
    setForm(canonicalForm);
    setDirtyFields(new Set());
    setLocationConfirmed(detail.latitude !== null && detail.longitude !== null);
    setFeedback(emptyFeedback);
    onEdit();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || !dirty) return;
    if (form.latitude.trim() && form.longitude.trim() && !locationConfirmed) {
      setFeedback({
        ...emptyFeedback,
        formMessage: "Hãy kiểm tra bản đồ và xác nhận địa chỉ & vị trí trước khi lưu."
      });
      return;
    }
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
    <form noValidate onSubmit={(event) => void save(event)} className={styles.editor}>
      {warning ? (
        <p className={styles.warning}>
          <Icon name="info" className="h-4 w-4 shrink-0" />
          {warning}
        </p>
      ) : null}

      <section aria-labelledby="owner-basic-heading" className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon} data-step="1">
            <Icon name="home" className="h-5 w-5" />
          </span>
          <div>
            <small>Bước 1</small>
            <h2 id="owner-basic-heading">Thông tin chỗ ở</h2>
            <p>Giúp người thuê hiểu nhanh đây là loại phòng nào và có phù hợp hay không.</p>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <SelectField
            id="owner-property-type"
            name="propertyTypeCode"
            label="Loại phòng"
            value={form.propertyTypeCode}
            error={combinedErrors.propertyTypeCode}
            disabled={pending}
            onChange={(event) => updateField("propertyTypeCode", event.target.value)}
          >
            <option value="">Chọn loại chỗ ở</option>
            {retainedProperty ? (
              <option value={retainedProperty.code} disabled>
                {retainedProperty.label}
                {propertyTypes.status === "success" ? " — không còn cho chọn mới" : " — giá trị hiện tại"}
              </option>
            ) : null}
            {propertyTypes.data.map((propertyType) => (
              <option key={propertyType.code} value={propertyType.code}>
                {localizedLabel(propertyType.code, propertyType.label, propertyTypeLabels)}
              </option>
            ))}
          </SelectField>
          {propertyTypes.status === "loading" ? (
            <p role="status" className={styles.lookupNote}>
              Đang tải loại chỗ ở…
            </p>
          ) : null}
          {propertyTypes.status === "error" ? (
            <div className={styles.lookupError} role="alert">
              <span>Không thể tải các loại phòng đang cho chọn.</span>
              <Button variant="secondary" onClick={onRetryPropertyTypes}>
                Thử lại loại phòng
              </Button>
            </div>
          ) : null}
          <InputField
            id="owner-title"
            name="title"
            label="Tiêu đề"
            leadingIcon={<Icon name="note" className="h-4 w-4" />}
            hint={`${form.title.length}/160 ký tự · Nên nêu loại phòng, khu vực và điểm nổi bật.`}
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
            hint={`${form.description.length}/5000 ký tự · Mô tả nội thất, giờ giấc, chi phí khác và đối tượng phù hợp.`}
            maxLength={5000}
            className={styles.description}
            value={form.description}
            error={combinedErrors.description}
            disabled={pending}
            onChange={(event) => updateField("description", event.target.value)}
          />
        </div>
      </section>

      <section aria-labelledby="owner-price-heading" className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon} data-step="2">
            <Icon name="ruler" className="h-5 w-5" />
          </span>
          <div>
            <small>Bước 2</small>
            <h2 id="owner-price-heading">Giá và thông số</h2>
            <p>Các con số quan trọng được đặt cùng một chỗ để nhập nhanh và dễ soát lại.</p>
          </div>
        </div>
        <div className={`${styles.sectionBody} ${styles.metricsGrid}`}>
          <InputField
            id="owner-rent"
            name="monthlyRent"
            label="Giá thuê mỗi tháng"
            leadingIcon={<Icon name="key" className="h-4 w-4" />}
            hint={formatCurrencyHint(form.monthlyRent)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={15}
            placeholder="3.500.000"
            value={formatCurrencyInput(form.monthlyRent)}
            error={combinedErrors.monthlyRent}
            disabled={pending}
            onChange={(event) => updateField("monthlyRent", currencyDigits(event.target.value))}
          />
          <InputField
            id="owner-area"
            name="roomAreaSqm"
            label="Diện tích (m²)"
            leadingIcon={<Icon name="ruler" className="h-4 w-4" />}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={form.roomAreaSqm}
            error={combinedErrors.roomAreaSqm}
            disabled={pending}
            onChange={(event) => updateField("roomAreaSqm", event.target.value)}
          />
          <InputField
            id="owner-max-occupants"
            name="maxOccupants"
            label="Sức chứa tối đa"
            leadingIcon={<Icon name="users" className="h-4 w-4" />}
            hint="Để trống nếu chưa xác định. Từ 1 đến 20 người."
            type="number"
            inputMode="numeric"
            min="1"
            max="20"
            step="1"
            value={form.maxOccupants}
            error={combinedErrors.maxOccupants}
            disabled={pending}
            onChange={(event) => updateField("maxOccupants", event.target.value)}
          />
        </div>
      </section>

      <section aria-labelledby="owner-amenities-heading" className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon} data-step="3">
            <Icon name="sparkles" className="h-5 w-5" />
          </span>
          <div>
            <small>Bước 3</small>
            <h2 id="owner-amenities-heading">Tiện ích</h2>
            <p>Chỉ chọn những tiện ích đang có để người thuê lọc và ra quyết định chính xác.</p>
          </div>
        </div>
        <div className={`${styles.sectionBody} ${styles.amenityGrid}`}>
          <CheckboxGroup
            id="owner-amenities"
            legend="Tiện ích hiện có"
            error={combinedErrors.amenityCodes}
            disabled={pending}
          >
            {amenities.data.map((amenity) => (
              <CheckboxField
                key={amenity.code}
                id={`owner-amenity-${amenity.code}`}
                name="amenityCodes"
                label={localizedLabel(amenity.code, amenity.label, amenityLabels)}
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
                label={`${amenity.label}${amenities.status === "success" ? " — đang dùng, không còn cho chọn mới" : " — giá trị hiện tại"}`}
                value={amenity.code}
                checked={form.amenityCodes.includes(amenity.code)}
                onChange={(event) => updateAmenity(amenity.code, event.target.checked)}
              />
            ))}
            {amenities.status === "success" && amenities.data.length === 0 && retainedAmenities.length === 0 ? (
              <p className={styles.lookupNote}>Hiện không có tiện ích để chọn.</p>
            ) : null}
          </CheckboxGroup>
          {amenities.status === "loading" ? (
            <p role="status" className={styles.lookupNote}>
              Đang tải tiện ích…
            </p>
          ) : null}
          {amenities.status === "error" ? (
            <div className={styles.lookupError} role="alert">
              <span>Không thể tải các tiện ích đang cho chọn.</span>
              <Button variant="secondary" onClick={onRetryAmenities}>
                Thử lại tiện ích
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="owner-location-heading" className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon} data-step="4">
            <Icon name="pin" className="h-5 w-5" />
          </span>
          <div>
            <small>Bước 4</small>
            <h2 id="owner-location-heading">Địa chỉ và vị trí</h2>
            <p>Nhập địa chỉ, kiểm tra ghim trên bản đồ rồi xác nhận trước khi lưu.</p>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.locationFields}>
            <InputField
              id="owner-address"
              name="addressText"
              label="Số nhà, đường, tòa nhà"
              leadingIcon={<Icon name="pin" className="h-4 w-4" />}
              hint="Ví dụ: 101 Nguyễn Huệ hoặc Tòa nhà A, đường Nguyễn Huệ. GPS có thể tự điền để bạn chỉnh lại."
              maxLength={500}
              value={form.addressText}
              error={combinedErrors.addressText}
              disabled={pending}
              onChange={(event) => updateAddress(event.target.value)}
            />
            <InputField
              id="owner-area-name"
              name="areaName"
              label="Phường/xã, tỉnh/thành phố"
              leadingIcon={<Icon name="map" className="h-4 w-4" />}
              hint="Theo địa chỉ hành chính mới, ví dụ: Phường Sài Gòn, TP.HCM."
              maxLength={120}
              value={form.areaName}
              error={combinedErrors.areaName}
              disabled={pending}
              onChange={(event) => updateField("areaName", event.target.value)}
            />
          </div>
          <OwnerLocationControls
            addressText={form.addressText}
            areaName={form.areaName}
            latitude={form.latitude}
            longitude={form.longitude}
            confirmed={locationConfirmed}
            error={combinedErrors.latitude ?? combinedErrors.longitude}
            disabled={pending}
            onCoordinatesChange={updateCoordinates}
            onCurrentLocationResolved={updateCurrentLocation}
            onConfirmationChange={(confirmed) => {
              setLocationConfirmed(confirmed);
              setFeedback(emptyFeedback);
              onEdit();
            }}
          />
        </div>
      </section>

      <div className={styles.feedbackStack}>
        {feedback.formMessage || externalFeedback?.formMessage ? (
          <p role="alert" className={styles.errorMessage}>
            {feedback.formMessage ?? externalFeedback?.formMessage}
            {feedback.requestId || externalFeedback?.requestId
              ? ` Mã yêu cầu: ${feedback.requestId ?? externalFeedback?.requestId}`
              : ""}
          </p>
        ) : null}
        {feedback.success ? (
          <p aria-live="polite" className={styles.successMessage}>
            {feedback.success}
          </p>
        ) : null}
      </div>

      {dirty || pending ? (
        <div className={styles.saveBar}>
          <div>
            <strong>Bạn có thay đổi chưa lưu</strong>
            <span>Lưu nội dung trước khi quản lý ảnh hoặc gửi duyệt.</span>
          </div>
          <Button type="button" variant="secondary" disabled={pending} onClick={revert}>
            Hoàn tác thay đổi
          </Button>
          <Button type="submit" pending={pending} pendingLabel="Đang lưu…">
            <Icon name="check" className="h-4 w-4" />
            Lưu thay đổi
          </Button>
        </div>
      ) : null}
    </form>
  );
}

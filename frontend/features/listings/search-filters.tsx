"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "../../components/ui/icon";
import type { Amenity, PropertyType, PublicListingSort } from "../../types/api";
import { activeFilterCount, searchFilterValues, type SearchFilterValues, type SearchQueryState } from "./search-query";
import styles from "./search-filters.module.css";

export interface LookupResource<T> {
  readonly status: "loading" | "success" | "error";
  readonly data: readonly T[];
}

export interface SearchFiltersProps {
  readonly committed: SearchQueryState;
  readonly propertyTypes: LookupResource<PropertyType>;
  readonly amenities: LookupResource<Amenity>;
  readonly onRetryPropertyTypes: () => void;
  readonly onRetryAmenities: () => void;
  readonly onApply: (values: SearchFilterValues, sort: PublicListingSort) => void;
  readonly onClear: () => void;
}

interface FilterDraft {
  readonly q: string;
  readonly areaName: string;
  readonly minMonthlyRent: string;
  readonly maxMonthlyRent: string;
  readonly minRoomAreaSqm: string;
  readonly maxRoomAreaSqm: string;
  readonly propertyType: string;
  readonly amenities: readonly string[];
  readonly sort: PublicListingSort;
}

type FieldErrors = Partial<Record<keyof FilterDraft, string>>;
type AreaPreset = "all" | "under20" | "20to30" | "30to50" | "over50" | "custom";

const BUDGET_MIN = 0;
const BUDGET_MAX = 15_000_000;
const BUDGET_STEP = 500_000;
const BUDGET_MIN_GAP = 1_000_000;

const emptySearchState: SearchQueryState = {
  mode: "ordinary",
  amenities: [],
  page: 1,
  pageSize: 20,
  sort: "newest"
};

function draftFromState(state: SearchQueryState): FilterDraft {
  const values = searchFilterValues(state);
  return {
    q: values.q ?? "",
    areaName: values.areaName ?? "",
    minMonthlyRent:
      values.minMonthlyRent === undefined || values.minMonthlyRent <= BUDGET_MIN
        ? ""
        : String(values.minMonthlyRent),
    maxMonthlyRent:
      values.maxMonthlyRent === undefined || values.maxMonthlyRent >= BUDGET_MAX
        ? ""
        : String(values.maxMonthlyRent),
    minRoomAreaSqm: values.minRoomAreaSqm === undefined ? "" : String(values.minRoomAreaSqm),
    maxRoomAreaSqm: values.maxRoomAreaSqm === undefined ? "" : String(values.maxRoomAreaSqm),
    propertyType: values.propertyType ?? "",
    amenities: values.amenities,
    sort: state.sort
  };
}

function parseWhole(value: string, field: keyof FilterDraft, errors: FieldErrors): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^[0-9]+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) {
    errors[field] = "Nhập một số nguyên dương.";
    return undefined;
  }
  return Number(value);
}

function parseArea(value: string, field: keyof FilterDraft, errors: FieldErrors): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value) || Number(value) <= 0 || !Number.isFinite(Number(value))) {
    errors[field] = "Nhập số dương với tối đa hai chữ số thập phân.";
    return undefined;
  }
  return Number(value);
}

function validateDraft(draft: FilterDraft): { values?: SearchFilterValues; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const minMonthlyRent = parseWhole(draft.minMonthlyRent, "minMonthlyRent", errors);
  const maxMonthlyRent = parseWhole(draft.maxMonthlyRent, "maxMonthlyRent", errors);
  const minRoomAreaSqm = parseArea(draft.minRoomAreaSqm, "minRoomAreaSqm", errors);
  const maxRoomAreaSqm = parseArea(draft.maxRoomAreaSqm, "maxRoomAreaSqm", errors);

  if (minMonthlyRent !== undefined && maxMonthlyRent !== undefined && maxMonthlyRent < minMonthlyRent) {
    errors.maxMonthlyRent = "Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.";
  }
  if (minRoomAreaSqm !== undefined && maxRoomAreaSqm !== undefined && maxRoomAreaSqm < minRoomAreaSqm) {
    errors.maxRoomAreaSqm = "Diện tích tối đa phải lớn hơn hoặc bằng diện tích tối thiểu.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    values: {
      ...(draft.q.trim() ? { q: draft.q.trim() } : {}),
      ...(draft.areaName.trim() ? { areaName: draft.areaName.trim() } : {}),
      ...(minMonthlyRent === undefined ? {} : { minMonthlyRent }),
      ...(maxMonthlyRent === undefined ? {} : { maxMonthlyRent }),
      ...(minRoomAreaSqm === undefined ? {} : { minRoomAreaSqm }),
      ...(maxRoomAreaSqm === undefined ? {} : { maxRoomAreaSqm }),
      ...(draft.propertyType ? { propertyType: draft.propertyType } : {}),
      amenities: draft.amenities
    }
  };
}

function areaPresetFor(draft: FilterDraft): AreaPreset {
  const { minRoomAreaSqm: min, maxRoomAreaSqm: max } = draft;
  if (!min && !max) return "all";
  if (!min && max === "20") return "under20";
  if (min === "20" && max === "30") return "20to30";
  if (min === "30" && max === "50") return "30to50";
  if (min === "50" && !max) return "over50";
  return "custom";
}

function areaValuesFor(preset: AreaPreset): Pick<FilterDraft, "minRoomAreaSqm" | "maxRoomAreaSqm"> {
  if (preset === "under20") return { minRoomAreaSqm: "", maxRoomAreaSqm: "20" };
  if (preset === "20to30") return { minRoomAreaSqm: "20", maxRoomAreaSqm: "30" };
  if (preset === "30to50") return { minRoomAreaSqm: "30", maxRoomAreaSqm: "50" };
  if (preset === "over50") return { minRoomAreaSqm: "50", maxRoomAreaSqm: "" };
  return { minRoomAreaSqm: "", maxRoomAreaSqm: "" };
}

function budgetSliderValue(monthlyRent: string, fallback: number): number {
  if (!monthlyRent) return fallback;
  const value = Number(monthlyRent);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, value));
}

function formatBudget(value: number): string {
  if (value <= BUDGET_MIN) return "0đ";
  if (value >= BUDGET_MAX) return "15 triệu+";
  const millions = value / 1_000_000;
  const label = Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(".", ",");
  return `${label} triệu/tháng`;
}

function FieldError({ message }: { readonly message?: string }) {
  return message ? (
    <p role="alert" className={styles.fieldError}>
      {message}
    </p>
  ) : null;
}

export function SearchFilters({
  committed,
  propertyTypes,
  amenities,
  onRetryPropertyTypes,
  onRetryAmenities,
  onApply,
  onClear
}: SearchFiltersProps) {
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromState(committed));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [amenitiesOpen, setAmenitiesOpen] = useState(() => committed.amenities.length > 0);
  const [customAreaOpen, setCustomAreaOpen] = useState(() => areaPresetFor(draftFromState(committed)) === "custom");

  useEffect(() => {
    setDraft(draftFromState(committed));
    setErrors({});
    setCustomAreaOpen(areaPresetFor(draftFromState(committed)) === "custom");
    if (committed.amenities.length > 0) setAmenitiesOpen(true);
  }, [committed]);

  const propertyOptions = useMemo(() => {
    const options = [...propertyTypes.data];
    if (draft.propertyType && !options.some((option) => option.code === draft.propertyType)) {
      options.push({ code: draft.propertyType, label: `Mã không còn trong danh mục: ${draft.propertyType}` });
    }
    return options;
  }, [draft.propertyType, propertyTypes.data]);

  const amenityOptions = useMemo(() => {
    const options = [...amenities.data];
    for (const selected of draft.amenities) {
      if (!options.some((option) => option.code === selected)) {
        options.push({ code: selected, label: `Mã không còn trong danh mục: ${selected}` });
      }
    }
    return options;
  }, [amenities.data, draft.amenities]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (result.values) onApply(result.values, draft.sort);
  };

  const clear = () => {
    setDraft(draftFromState(emptySearchState));
    setErrors({});
    setAmenitiesOpen(false);
    setCustomAreaOpen(false);
    onClear();
  };

  const count = activeFilterCount(committed);
  const selectedAreaPreset = customAreaOpen ? "custom" : areaPresetFor(draft);
  const selectedMaxBudget = Math.max(
    BUDGET_MIN_GAP,
    budgetSliderValue(draft.maxMonthlyRent, BUDGET_MAX)
  );
  const selectedMinBudget = Math.min(
    budgetSliderValue(draft.minMonthlyRent, BUDGET_MIN),
    selectedMaxBudget - BUDGET_MIN_GAP
  );
  const minBudgetProgress = ((selectedMinBudget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const maxBudgetProgress = ((selectedMaxBudget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  return (
    <form aria-label="Bộ lọc tìm phòng" onSubmit={submit} className={styles.filters} noValidate>
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleIcon}>
            <Icon name="sliders" className="h-5 w-5" />
          </span>
          <div>
            <h2>Bộ lọc</h2>
            {count > 0 ? <span>{count} điều kiện đang dùng</span> : <span>Tìm theo nhu cầu của bạn</span>}
          </div>
        </div>
        <button type="button" className={styles.resetButton} onClick={clear}>
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Đặt lại
        </button>
      </header>

      <div className={styles.scrollArea}>
        <section className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="listing-search-q">
            Từ khóa
          </label>
          <div className={styles.inputWithIcon}>
            <Icon name="search" className="h-4 w-4" />
            <input
              id="listing-search-q"
              name="q"
              type="search"
              placeholder="Địa chỉ, tên phòng…"
              value={draft.q}
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
            />
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="listing-area-name">
            Khu vực
          </label>
          <div className={styles.inputWithIcon}>
            <Icon name="pin" className="h-4 w-4" />
            <input
              id="listing-area-name"
              name="areaName"
              placeholder="Ví dụ: Quận 1"
              value={draft.areaName}
              onChange={(event) => setDraft((current) => ({ ...current, areaName: event.target.value }))}
            />
          </div>
        </section>

        <fieldset className={styles.section}>
          <legend className={styles.sectionLabel}>Loại phòng</legend>
          {propertyTypes.status === "loading" ? (
            <p role="status" className={styles.helpText}>
              Đang tải loại phòng…
            </p>
          ) : propertyTypes.status === "error" ? (
            <div role="alert" className={styles.lookupError}>
              <span>Chưa tải được danh mục.</span>
              <button type="button" onClick={onRetryPropertyTypes}>
                Thử lại
              </button>
            </div>
          ) : (
            <div className={styles.choiceList}>
              <label className={styles.choice}>
                <input
                  type="radio"
                  name="propertyType"
                  value=""
                  checked={draft.propertyType === ""}
                  onChange={() => setDraft((current) => ({ ...current, propertyType: "" }))}
                />
                <span>Tất cả loại phòng</span>
              </label>
              {propertyOptions.map((option) => (
                <label key={option.code} className={styles.choice}>
                  <input
                    type="radio"
                    name="propertyType"
                    value={option.code}
                    checked={draft.propertyType === option.code}
                    onChange={() => setDraft((current) => ({ ...current, propertyType: option.code }))}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <section className={styles.section}>
          <div className={styles.budgetHeader}>
            <span className={styles.sectionLabel}>Khoảng giá</span>
            <div className={styles.budgetValues}>
              <output htmlFor="listing-min-budget" className={styles.budgetValue}>
                {formatBudget(selectedMinBudget)}
              </output>
              <span aria-hidden="true">→</span>
              <output htmlFor="listing-max-budget" className={styles.budgetValue}>
                {formatBudget(selectedMaxBudget)}
              </output>
            </div>
          </div>
          <div className={styles.budgetSliderWrap}>
            <div className={styles.budgetTrack}>
              <span
                className={styles.budgetTrackFill}
                aria-hidden="true"
                style={{
                  left: `${minBudgetProgress}%`,
                  right: `${100 - maxBudgetProgress}%`
                }}
              />
              <input
                id="listing-min-budget"
                aria-label="Giá tối thiểu"
                aria-valuetext={
                  selectedMinBudget <= BUDGET_MIN
                    ? "Không đặt giá tối thiểu"
                    : formatBudget(selectedMinBudget)
                }
                className={`${styles.budgetSlider} ${styles.budgetSliderMin}`}
                name="minMonthlyRent"
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={selectedMinBudget}
                aria-valuemax={selectedMaxBudget - BUDGET_MIN_GAP}
                onChange={(event) => {
                  const value = Math.min(Number(event.target.value), selectedMaxBudget - BUDGET_MIN_GAP);
                  setDraft((current) => ({
                    ...current,
                    minMonthlyRent: value <= BUDGET_MIN ? "" : String(value)
                  }));
                  setErrors((current) => ({ ...current, minMonthlyRent: undefined, maxMonthlyRent: undefined }));
                }}
              />
              <input
                id="listing-max-budget"
                aria-label="Giá tối đa"
                aria-valuetext={
                  selectedMaxBudget >= BUDGET_MAX
                    ? "15 triệu trở lên, không giới hạn"
                    : formatBudget(selectedMaxBudget)
                }
                className={`${styles.budgetSlider} ${styles.budgetSliderMax}`}
                name="maxMonthlyRent"
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={selectedMaxBudget}
                aria-valuemin={selectedMinBudget + BUDGET_MIN_GAP}
                onChange={(event) => {
                  const value = Math.max(Number(event.target.value), selectedMinBudget + BUDGET_MIN_GAP);
                  setDraft((current) => ({
                    ...current,
                    maxMonthlyRent: value >= BUDGET_MAX ? "" : String(value)
                  }));
                  setErrors((current) => ({ ...current, minMonthlyRent: undefined, maxMonthlyRent: undefined }));
                }}
              />
            </div>
            <div className={styles.budgetScale} aria-hidden="true">
              <span>0đ</span>
              <span>15 triệu+</span>
            </div>
          </div>
          <FieldError message={errors.minMonthlyRent} />
          <FieldError message={errors.maxMonthlyRent} />
        </section>

        <fieldset className={styles.section}>
          <legend className={styles.sectionLabel}>Diện tích</legend>
          <div className={styles.choiceList}>
            {[
              ["all", "Tất cả diện tích"],
              ["under20", "Dưới 20 m²"],
              ["20to30", "20 – 30 m²"],
              ["30to50", "30 – 50 m²"],
              ["over50", "Trên 50 m²"],
              ["custom", "Tùy chỉnh"]
            ].map(([value, label]) => (
              <label key={value} className={styles.choice}>
                <input
                  type="radio"
                  name="areaPreset"
                  value={value}
                  checked={selectedAreaPreset === value}
                  onChange={() => {
                    const preset = value as AreaPreset;
                    setCustomAreaOpen(preset === "custom");
                    setDraft((current) => ({
                      ...current,
                      ...(preset === "custom"
                        ? { minRoomAreaSqm: current.minRoomAreaSqm, maxRoomAreaSqm: current.maxRoomAreaSqm }
                        : areaValuesFor(preset))
                    }));
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {selectedAreaPreset === "custom" ? (
            <div className={styles.customArea}>
              <label>
                <span>Từ m²</span>
                <input
                  aria-label="Diện tích từ (m²)"
                  name="minRoomAreaSqm"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={draft.minRoomAreaSqm}
                  onChange={(event) => setDraft((current) => ({ ...current, minRoomAreaSqm: event.target.value }))}
                />
              </label>
              <label>
                <span>Đến m²</span>
                <input
                  aria-label="Diện tích đến (m²)"
                  name="maxRoomAreaSqm"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={draft.maxRoomAreaSqm}
                  onChange={(event) => setDraft((current) => ({ ...current, maxRoomAreaSqm: event.target.value }))}
                />
              </label>
            </div>
          ) : null}
          <FieldError message={errors.minRoomAreaSqm} />
          <FieldError message={errors.maxRoomAreaSqm} />
        </fieldset>

        <section className={styles.section}>
          <button
            type="button"
            className={styles.amenityToggle}
            aria-expanded={amenitiesOpen}
            aria-controls="listing-amenities"
            onClick={() => setAmenitiesOpen((open) => !open)}
          >
            <span>
              <strong>Tiện ích</strong>
              <small>{draft.amenities.length > 0 ? `${draft.amenities.length} đã chọn` : "Không bắt buộc"}</small>
            </span>
            <Icon name="chevronDown" className={amenitiesOpen ? styles.chevronOpen : styles.chevron} />
          </button>
          {amenitiesOpen ? (
            <div id="listing-amenities" className={styles.amenityPanel}>
              <p className={styles.helpText}>Phòng phải có tất cả tiện ích đã chọn.</p>
              {amenities.status === "loading" ? (
                <p role="status" className={styles.helpText}>
                  Đang tải tiện ích…
                </p>
              ) : amenities.status === "error" ? (
                <div role="alert" className={styles.lookupError}>
                  <span>Chưa tải được tiện ích.</span>
                  <button type="button" onClick={onRetryAmenities}>
                    Thử lại
                  </button>
                </div>
              ) : amenityOptions.length === 0 ? (
                <p className={styles.helpText}>Chưa có tiện ích đang hoạt động.</p>
              ) : (
                <div className={styles.amenityList}>
                  {amenityOptions.map((amenity) => (
                    <label key={amenity.code} className={styles.choice}>
                      <input
                        type="checkbox"
                        name="amenities"
                        value={amenity.code}
                        checked={draft.amenities.includes(amenity.code)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            amenities: event.target.checked
                              ? [...current.amenities, amenity.code]
                              : current.amenities.filter((code) => code !== amenity.code)
                          }))
                        }
                      />
                      <span>{amenity.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <div className={styles.applyBar}>
        <button type="submit" className={styles.applyButton}>
          <Icon name="search" className="h-4 w-4" />
          Tìm kiếm
        </button>
      </div>
    </form>
  );
}

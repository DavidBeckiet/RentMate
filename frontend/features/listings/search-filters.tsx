"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "../../components/ui/icon";
import { areaSuggestionMatches, formatAreaLabel } from "../../lib/area";
import type { Amenity, PropertyType, PublicListingSort } from "../../types/api";
import { activeFilterCount, searchFilterValues, type SearchFilterValues, type SearchQueryState } from "./search-query";
import { amenityLabel, propertyTypeLabel } from "./room-type-label";
import styles from "./search-filters.module.css";

export interface LookupResource<T> {
  readonly status: "loading" | "success" | "error";
  readonly data: readonly T[];
}

export interface SearchFiltersProps {
  readonly committed: SearchQueryState;
  readonly propertyTypes: LookupResource<PropertyType>;
  readonly amenities: LookupResource<Amenity>;
  readonly areas: LookupResource<string>;
  readonly onRetryPropertyTypes: () => void;
  readonly onRetryAmenities: () => void;
  readonly onRetryAreas: () => void;
  readonly onApply: (values: SearchFilterValues, sort: PublicListingSort) => void;
  readonly onClear: () => void;
  readonly onOpenMap?: () => void;
  readonly idPrefix?: string;
}

interface FilterDraft {
  readonly q: string;
  readonly areaName: string;
  readonly minMonthlyRent: string;
  readonly maxMonthlyRent: string;
  readonly minRoomAreaSqm: string;
  readonly maxRoomAreaSqm: string;
  readonly minOccupants: string;
  readonly propertyType: string;
  readonly amenities: readonly string[];
  readonly sort: PublicListingSort;
}

type FieldErrors = Partial<Record<keyof FilterDraft, string>>;
type AreaPreset = "all" | "under20" | "20to30" | "30to40" | "40to60" | "from60" | "custom";

const BUDGET_MIN = 0;
const BUDGET_MAX = 15_000_000;
const BUDGET_STEP = 500_000;
const MAX_MONTHLY_RENT = 999_999_999_999;

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
      values.minMonthlyRent === undefined || values.minMonthlyRent <= BUDGET_MIN ? "" : String(values.minMonthlyRent),
    maxMonthlyRent: values.maxMonthlyRent === undefined ? "" : String(values.maxMonthlyRent),
    minRoomAreaSqm: values.minRoomAreaSqm === undefined ? "" : String(values.minRoomAreaSqm),
    maxRoomAreaSqm: values.maxRoomAreaSqm === undefined ? "" : String(values.maxRoomAreaSqm),
    minOccupants: values.minOccupants === undefined ? "" : String(values.minOccupants),
    propertyType: values.propertyType ?? "",
    amenities: values.amenities,
    sort: state.sort
  };
}

function parseWhole(
  value: string,
  field: keyof FilterDraft,
  errors: FieldErrors,
  maximum?: number
): number | undefined {
  if (!value.trim()) return undefined;
  if (
    !/^[0-9]+$/.test(value) ||
    Number(value) <= 0 ||
    !Number.isSafeInteger(Number(value)) ||
    (maximum !== undefined && Number(value) > maximum)
  ) {
    errors[field] = maximum === 20 ? "Số người phải từ 1 đến 20." : "Nhập một số nguyên dương.";
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
  const minMonthlyRent = parseWhole(draft.minMonthlyRent, "minMonthlyRent", errors, MAX_MONTHLY_RENT);
  const maxMonthlyRent = parseWhole(draft.maxMonthlyRent, "maxMonthlyRent", errors, MAX_MONTHLY_RENT);
  const minRoomAreaSqm = parseArea(draft.minRoomAreaSqm, "minRoomAreaSqm", errors);
  const maxRoomAreaSqm = parseArea(draft.maxRoomAreaSqm, "maxRoomAreaSqm", errors);
  const minOccupants = parseWhole(draft.minOccupants, "minOccupants", errors, 20);

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
      ...(draft.areaName.trim() ? { areaName: formatAreaLabel(draft.areaName) } : {}),
      ...(minMonthlyRent === undefined ? {} : { minMonthlyRent }),
      ...(maxMonthlyRent === undefined ? {} : { maxMonthlyRent }),
      ...(minRoomAreaSqm === undefined ? {} : { minRoomAreaSqm }),
      ...(maxRoomAreaSqm === undefined ? {} : { maxRoomAreaSqm }),
      ...(minOccupants === undefined ? {} : { minOccupants }),
      ...(draft.propertyType ? { propertyType: draft.propertyType } : {}),
      amenities: draft.amenities
    }
  };
}

function areaPresetFor(draft: FilterDraft): AreaPreset {
  const { minRoomAreaSqm: min, maxRoomAreaSqm: max } = draft;
  if (!min && !max) return "all";
  if (!min && max === "19.99") return "under20";
  if (min === "20" && max === "29.99") return "20to30";
  if (min === "30" && max === "39.99") return "30to40";
  if (min === "40" && max === "59.99") return "40to60";
  if (min === "60" && !max) return "from60";
  return "custom";
}

function areaValuesFor(preset: AreaPreset): Pick<FilterDraft, "minRoomAreaSqm" | "maxRoomAreaSqm"> {
  if (preset === "under20") return { minRoomAreaSqm: "", maxRoomAreaSqm: "19.99" };
  if (preset === "20to30") return { minRoomAreaSqm: "20", maxRoomAreaSqm: "29.99" };
  if (preset === "30to40") return { minRoomAreaSqm: "30", maxRoomAreaSqm: "39.99" };
  if (preset === "40to60") return { minRoomAreaSqm: "40", maxRoomAreaSqm: "59.99" };
  if (preset === "from60") return { minRoomAreaSqm: "60", maxRoomAreaSqm: "" };
  return { minRoomAreaSqm: "", maxRoomAreaSqm: "" };
}

function budgetSliderValue(monthlyRent: string, fallback: number): number {
  if (!monthlyRent) return fallback;
  const value = Number(monthlyRent);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, value));
}

function advancedFilterIsActive(state: SearchQueryState): boolean {
  return Boolean(
    state.q ||
      state.minRoomAreaSqm !== undefined ||
      state.maxRoomAreaSqm !== undefined ||
      state.minOccupants !== undefined ||
      state.amenities.length > 0
  );
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
  areas,
  onRetryPropertyTypes,
  onRetryAmenities,
  onRetryAreas,
  onApply,
  onClear,
  onOpenMap,
  idPrefix = ""
}: SearchFiltersProps) {
  const fieldIdPrefix = idPrefix ? `${idPrefix}-` : "";
  const fieldNamePrefix = idPrefix ? `${idPrefix}-` : "";
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromState(committed));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [amenitiesOpen, setAmenitiesOpen] = useState(() => committed.amenities.length > 0);
  const [customAreaOpen, setCustomAreaOpen] = useState(() => areaPresetFor(draftFromState(committed)) === "custom");
  const [advancedOpen, setAdvancedOpen] = useState(() => advancedFilterIsActive(committed));
  const [areaSuggestionsOpen, setAreaSuggestionsOpen] = useState(false);
  const [activeAreaSuggestion, setActiveAreaSuggestion] = useState(-1);
  const areaComboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(draftFromState(committed));
    setErrors({});
    setCustomAreaOpen(areaPresetFor(draftFromState(committed)) === "custom");
    setAdvancedOpen(advancedFilterIsActive(committed));
    setAreaSuggestionsOpen(false);
    setActiveAreaSuggestion(-1);
    if (committed.amenities.length > 0) setAmenitiesOpen(true);
  }, [committed]);

  useEffect(() => {
    if (!areaSuggestionsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!areaComboboxRef.current?.contains(event.target as Node)) setAreaSuggestionsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [areaSuggestionsOpen]);

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

  const areaSuggestions = useMemo(() => {
    const query = draft.areaName.trim();
    if (!query) return [];
    return [...new Set(areas.data.map((area) => formatAreaLabel(area)))]
      .filter((area) => areaSuggestionMatches(area, query))
      .slice(0, 8);
  }, [areas.data, draft.areaName]);

  const areaListVisible = areaSuggestionsOpen && (areaSuggestions.length > 0 || areas.status === "error");

  const selectAreaSuggestion = (area: string) => {
    setDraft((current) => ({ ...current, areaName: formatAreaLabel(area) }));
    setAreaSuggestionsOpen(false);
    setActiveAreaSuggestion(-1);
  };

  const handleAreaKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!areaListVisible || areaSuggestions.length === 0) {
      if (event.key === "Escape") setAreaSuggestionsOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveAreaSuggestion((current) => (current + 1) % areaSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveAreaSuggestion((current) => (current <= 0 ? areaSuggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeAreaSuggestion >= 0) {
      event.preventDefault();
      selectAreaSuggestion(areaSuggestions[activeAreaSuggestion]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setAreaSuggestionsOpen(false);
      setActiveAreaSuggestion(-1);
    }
  };

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
    setAdvancedOpen(false);
    setAreaSuggestionsOpen(false);
    setActiveAreaSuggestion(-1);
    onClear();
  };

  const count = activeFilterCount(committed);
  const selectedAreaPreset = customAreaOpen ? "custom" : areaPresetFor(draft);
  const selectedMaxBudget = budgetSliderValue(draft.maxMonthlyRent, BUDGET_MAX);
  const selectedMinBudget = budgetSliderValue(draft.minMonthlyRent, BUDGET_MIN);
  const visualMinBudget = Math.min(selectedMinBudget, selectedMaxBudget);
  const visualMaxBudget = Math.max(selectedMinBudget, selectedMaxBudget);
  const minBudgetProgress = ((visualMinBudget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const maxBudgetProgress = ((visualMaxBudget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

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

      {onOpenMap ? (
        <section className={styles.mapSection}>
          <button type="button" className={styles.mapAction} aria-label="Mở bản đồ" onClick={onOpenMap}>
            <span className={styles.mapActionIcon}>
              <Icon name="map" className="h-4 w-4" />
            </span>
            <span className={styles.mapActionCopy}>
              <strong>Bộ lọc bản đồ</strong>
              <small>Mở bản đồ để chọn khu vực hoặc bán kính.</small>
            </span>
            <Icon name="arrow" className="h-4 w-4 shrink-0" />
          </button>
        </section>
      ) : null}

      <div className={styles.scrollArea}>
        <div className={styles.primaryGroup} aria-label="Bộ lọc chính">
          <section className={styles.section}>
            <label className={styles.sectionLabel} htmlFor={`${fieldIdPrefix}listing-area-name`}>
              Khu vực
            </label>
            <div className={styles.areaCombobox} ref={areaComboboxRef}>
              <div className={styles.inputWithIcon}>
                <Icon name="pin" className="h-4 w-4" />
                <input
                  id={`${fieldIdPrefix}listing-area-name`}
                  name="areaName"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={`${fieldIdPrefix}area-suggestions`}
                  aria-expanded={areaListVisible}
                  aria-activedescendant={
                    activeAreaSuggestion >= 0 ? `${fieldIdPrefix}area-suggestion-${activeAreaSuggestion}` : undefined
                  }
                  autoComplete="off"
                  placeholder="Nhập khu vực…"
                  value={draft.areaName}
                  onFocus={() => {
                    if (draft.areaName.trim()) setAreaSuggestionsOpen(true);
                  }}
                  onKeyDown={handleAreaKeyDown}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, areaName: event.target.value }));
                    setAreaSuggestionsOpen(true);
                    setActiveAreaSuggestion(-1);
                  }}
                />
              </div>
              {areaListVisible ? (
                <div id={`${fieldIdPrefix}area-suggestions`} role="listbox" className={styles.areaSuggestions}>
                  {areaSuggestions.map((area, index) => (
                    <button
                      key={area}
                      id={`${fieldIdPrefix}area-suggestion-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeAreaSuggestion === index}
                      className={styles.areaSuggestion}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectAreaSuggestion(area)}
                    >
                      <Icon name="pin" className="h-4 w-4" />
                      <span>{area}</span>
                    </button>
                  ))}
                  {areas.status === "error" ? (
                    <div className={styles.areaSuggestionStatus} role="status">
                      <span>Gợi ý tạm thời không khả dụng. Bạn vẫn có thể nhập tự do.</span>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRetryAreas}>
                        Thử lại
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className={styles.helpText}>Chọn gợi ý hoặc nhập tên khu vực bạn muốn tìm.</p>
          </section>

          <section className={styles.section}>
            <div className={styles.budgetHeader}>
              <span className={styles.sectionLabel}>Khoảng giá</span>
              <div className={styles.budgetValues}>
                <output className={styles.budgetValue}>{formatBudget(selectedMinBudget)}</output>
                <span aria-hidden="true">→</span>
                <output className={styles.budgetValue}>{formatBudget(selectedMaxBudget)}</output>
              </div>
            </div>
            <div className={styles.budgetInputs}>
              <label>
                <span>Giá từ</span>
                <input
                  aria-label="Giá tối thiểu chính xác"
                  name="minMonthlyRent"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="Không giới hạn"
                  value={draft.minMonthlyRent}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, minMonthlyRent: event.target.value }));
                    setErrors((current) => ({ ...current, minMonthlyRent: undefined, maxMonthlyRent: undefined }));
                  }}
                />
              </label>
              <label>
                <span>Giá đến</span>
                <input
                  aria-label="Giá tối đa chính xác"
                  name="maxMonthlyRent"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="Không giới hạn"
                  value={draft.maxMonthlyRent}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, maxMonthlyRent: event.target.value }));
                    setErrors((current) => ({ ...current, minMonthlyRent: undefined, maxMonthlyRent: undefined }));
                  }}
                />
              </label>
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
                  aria-label="Giá tối thiểu"
                  aria-valuetext={
                    selectedMinBudget <= BUDGET_MIN ? "Không đặt giá tối thiểu" : formatBudget(selectedMinBudget)
                  }
                  className={`${styles.budgetSlider} ${styles.budgetSliderMin}`}
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={selectedMinBudget}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setDraft((current) => ({
                      ...current,
                      minMonthlyRent: value <= BUDGET_MIN ? "" : String(value)
                    }));
                    setErrors((current) => ({ ...current, minMonthlyRent: undefined, maxMonthlyRent: undefined }));
                  }}
                />
                <input
                  aria-label="Giá tối đa"
                  aria-valuetext={
                    selectedMaxBudget >= BUDGET_MAX ? "15 triệu trở lên" : formatBudget(selectedMaxBudget)
                  }
                  className={`${styles.budgetSlider} ${styles.budgetSliderMax}`}
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={selectedMaxBudget}
                  onChange={(event) => {
                    const value = Number(event.target.value);
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
            <p className={styles.helpText}>Nhập giá chính xác để tìm cả các khoảng hẹp hoặc mức trên 15 triệu.</p>
            <FieldError message={errors.minMonthlyRent} />
            <FieldError message={errors.maxMonthlyRent} />
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
                    name={`${fieldNamePrefix}propertyType`}
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
                      name={`${fieldNamePrefix}propertyType`}
                      value={option.code}
                      checked={draft.propertyType === option.code}
                      onChange={() => setDraft((current) => ({ ...current, propertyType: option.code }))}
                    />
                    <span>{propertyTypeLabel(option)}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        <section className={styles.advancedSection}>
          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={advancedOpen}
            aria-controls={`${fieldIdPrefix}advanced-filters`}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>
              <strong>Bộ lọc nâng cao</strong>
              <small>Nhập tên tin, diện tích, sức chứa và tiện ích</small>
            </span>
            <Icon name="chevronDown" className={advancedOpen ? styles.chevronOpen : styles.chevron} />
          </button>

          {advancedOpen ? (
            <div id={`${fieldIdPrefix}advanced-filters`} className={styles.advancedPanel}>
              <section className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={`${fieldIdPrefix}listing-search-q`}>
                  Tên tin đăng hoặc khu vực
                </label>
                <div className={styles.inputWithIcon}>
                  <Icon name="search" className="h-4 w-4" />
                  <input
                    id={`${fieldIdPrefix}listing-search-q`}
                    name="q"
                    type="search"
                    placeholder="Ví dụ: studio có gác, Quận 3"
                    value={draft.q}
                    onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
                  />
                </div>
                <p className={styles.helpText}>Tìm trong tên tin đăng hoặc khu vực công khai.</p>
              </section>

              <section className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={`${fieldIdPrefix}listing-min-occupants`}>
                  Số người sẽ ở
                </label>
                <div className={styles.inputWithIcon}>
                  <Icon name="users" className="h-4 w-4" />
                  <input
                    id={`${fieldIdPrefix}listing-min-occupants`}
                    name="minOccupants"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="20"
                    step="1"
                    placeholder="Không giới hạn"
                    value={draft.minOccupants}
                    onChange={(event) => setDraft((current) => ({ ...current, minOccupants: event.target.value }))}
                  />
                </div>
                <p className={styles.helpText}>Chỉ hiển thị phòng có sức chứa đủ cho số người này.</p>
                <FieldError message={errors.minOccupants} />
              </section>

              <fieldset className={styles.section}>
                <legend className={styles.sectionLabel}>Diện tích phòng</legend>
                <div className={styles.choiceList}>
                  {[
                    ["all", "Tất cả diện tích"],
                    ["under20", "Dưới 20 m²"],
                    ["20to30", "20 – 30 m²"],
                    ["30to40", "30 – 40 m²"],
                    ["40to60", "40 – 60 m²"],
                    ["from60", "Từ 60 m²"],
                    ["custom", "Tùy chỉnh"]
                  ].map(([value, label]) => (
                    <label key={value} className={styles.choice}>
                      <input
                        type="radio"
                        name={`${fieldNamePrefix}areaPreset`}
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
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, minRoomAreaSqm: event.target.value }))
                        }
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
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, maxRoomAreaSqm: event.target.value }))
                        }
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
                  aria-controls={`${fieldIdPrefix}listing-amenities`}
                  onClick={() => setAmenitiesOpen((open) => !open)}
                >
                  <span>
                    <strong>Tiện ích</strong>
                    <small>{draft.amenities.length > 0 ? `${draft.amenities.length} đã chọn` : "Không bắt buộc"}</small>
                  </span>
                  <Icon name="chevronDown" className={amenitiesOpen ? styles.chevronOpen : styles.chevron} />
                </button>
                {amenitiesOpen ? (
                  <div id={`${fieldIdPrefix}listing-amenities`} className={styles.amenityPanel}>
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
                              name={`${fieldNamePrefix}amenities`}
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
                            <span>{amenityLabel(amenity)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
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

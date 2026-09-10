export interface AreaCatalogEntry {
  readonly key: string;
  readonly label: string;
  readonly aliases: readonly string[];
}

/**
 * The public/demo geography currently used across RentMate. Keys are stable
 * internal values; labels are the only form intended for customer-facing UI.
 */
export const rentMateAreaCatalog = Object.freeze([
  { key: "quan-1", label: "Qu\u1eadn 1", aliases: ["Quan 1", "Q1", "Q.1", "District 1"] },
  { key: "quan-3", label: "Qu\u1eadn 3", aliases: ["Quan 3", "Q3", "Q.3", "District 3"] },
  { key: "quan-7", label: "Qu\u1eadn 7", aliases: ["Quan 7", "Q7", "Q.7", "District 7"] },
  { key: "binh-thanh", label: "B\u00ecnh Th\u1ea1nh", aliases: ["Binh Thanh"] },
  { key: "thu-duc", label: "Th\u1ee7 \u0110\u1ee9c", aliases: ["Thu Duc", "TP Thu Duc", "Thanh pho Thu Duc"] },
  { key: "tan-binh", label: "T\u00e2n B\u00ecnh", aliases: ["Tan Binh"] },
  { key: "phu-nhuan", label: "Ph\u00fa Nhu\u1eadn", aliases: ["Phu Nhuan"] },
  { key: "go-vap", label: "G\u00f2 V\u1ea5p", aliases: ["Go Vap"] },
  { key: "thao-dien", label: "Th\u1ea3o \u0110i\u1ec1n", aliases: ["Thao Dien"] },
  { key: "ben-thanh", label: "B\u1ebfn Th\u00e0nh", aliases: ["Ben Thanh"] }
] as const satisfies readonly AreaCatalogEntry[]);

export function normalizeAreaLookupForm(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[\u0111\u0110]/gu, "d")
    .toLocaleLowerCase("vi-VN")
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-+)|(-+$)/gu, "");
}

const areaByLookup = new Map<string, AreaCatalogEntry>();

for (const entry of rentMateAreaCatalog) {
  for (const alias of [entry.key, entry.label, ...entry.aliases]) {
    const lookup = normalizeAreaLookupForm(alias);
    if (lookup) areaByLookup.set(lookup, entry);
  }
}

export function matchAreaAlias(value: string | null | undefined): AreaCatalogEntry | null {
  const lookup = normalizeAreaLookupForm(value);
  return lookup ? (areaByLookup.get(lookup) ?? null) : null;
}

/** Returns a stable key for known areas, and a safe normalized key for legacy/unknown input. */
export function canonicalizeAreaInput(value: string | null | undefined): string | null {
  const lookup = normalizeAreaLookupForm(value);
  if (!lookup) return null;
  return areaByLookup.get(lookup)?.key ?? lookup;
}

function humanizeUnknownArea(value: string): string {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  if (!trimmed) return "";
  if (!/^[a-z0-9_-]+$/iu.test(trimmed)) return trimmed;
  return trimmed.replace(/[_-]+/gu, " ").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("vi-VN"));
}

export function formatAreaLabel(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return matchAreaAlias(value)?.label ?? humanizeUnknownArea(value);
}

/**
 * A small, deterministic set of known spellings suitable for bounded SQL
 * matching against legacy `area_name` values. Unknown input stays literal.
 */
export function areaSearchTerms(value: string | null | undefined): readonly string[] {
  if (typeof value !== "string" || !value.trim()) return Object.freeze([]);
  const entry = matchAreaAlias(value);
  if (!entry) return Object.freeze([value.trim()]);
  const terms = new Map<string, string>();
  for (const term of [entry.label, entry.key, ...entry.aliases]) {
    const termKey = term.toLocaleLowerCase("vi-VN").trim();
    if (termKey && !terms.has(termKey)) terms.set(termKey, term);
  }
  return Object.freeze([...terms.values()]);
}

export function areaMatches(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftLookup = normalizeAreaLookupForm(left);
  const rightLookup = normalizeAreaLookupForm(right);
  if (!leftLookup || !rightLookup) return false;
  const leftEntry = areaByLookup.get(leftLookup);
  const rightEntry = areaByLookup.get(rightLookup);
  if (leftEntry && rightEntry) return leftEntry.key === rightEntry.key;
  return leftLookup === rightLookup || leftLookup.includes(rightLookup) || rightLookup.includes(leftLookup);
}

export function areaSuggestionMatches(area: string, input: string): boolean {
  const query = normalizeAreaLookupForm(input);
  if (!query) return false;
  const entry = matchAreaAlias(area);
  const candidates = entry ? [entry.key, entry.label, ...entry.aliases] : [area];
  return candidates.some((candidate) => normalizeAreaLookupForm(candidate).includes(query));
}

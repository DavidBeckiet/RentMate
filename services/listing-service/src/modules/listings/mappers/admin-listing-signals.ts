export interface AdminListingSignalRow {
  readonly open_report_count: unknown;
  readonly possible_duplicate: unknown;
}

export interface AdminListingSignals {
  readonly openReportCount: number;
  readonly possibleDuplicate: boolean;
}

export class AdminListingSignalMappingError extends Error {
  constructor() {
    super("Admin listing signal representation is invalid.");
    this.name = "AdminListingSignalMappingError";
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function mapAdminListingSignals(row: Readonly<AdminListingSignalRow>): AdminListingSignals {
  if (!isNonNegativeInteger(row.open_report_count) || typeof row.possible_duplicate !== "boolean") {
    throw new AdminListingSignalMappingError();
  }

  return Object.freeze({
    openReportCount: row.open_report_count,
    possibleDuplicate: row.possible_duplicate
  });
}

export function copyAdminListingSignals(signals: Readonly<AdminListingSignals>): AdminListingSignals {
  return mapAdminListingSignals({
    open_report_count: signals.openReportCount,
    possible_duplicate: signals.possibleDuplicate
  });
}

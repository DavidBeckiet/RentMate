import type {
  ContactReportCategory,
  ContactReportStatus,
  ReportCategory,
  ReportStatus,
  ReviewReportCategory,
  ReviewReportStatus,
  RoommateReportCategory,
  RoommateReportStatus,
  RoommateRiskPriority
} from "../../types/api";

export type ReportSource = "listing" | "contact" | "roommate" | "review";
export type AnyReportStatus = ReportStatus | ContactReportStatus | ReviewReportStatus | RoommateReportStatus;
export type AnyReportCategory = ReportCategory | ContactReportCategory | ReviewReportCategory | RoommateReportCategory;

export interface AdminReportQueueState {
  readonly status: AnyReportStatus;
  readonly category: AnyReportCategory | "";
  readonly page: number;
  readonly reviewPriority: RoommateRiskPriority | "";
}

const statuses = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
const categories: Record<ReportSource, readonly string[]> = {
  listing: ["PRICE_INCORRECT", "LOCATION_INCORRECT", "IMAGE_INCORRECT", "ALREADY_RENTED", "FRAUD", "INAPPROPRIATE"],
  contact: ["SPAM", "FRAUD", "HARASSMENT", "INAPPROPRIATE", "OTHER"],
  roommate: ["FRAUD", "PAYMENT_SCAM", "SPAM", "HARASSMENT", "IMPERSONATION", "INAPPROPRIATE_CONTENT", "OTHER"],
  review: ["INACCURATE", "OFFENSIVE", "HARASSMENT", "SPAM", "OTHER"]
};

export const reportStatusLabels: Record<AnyReportStatus, string> = {
  OPEN: "Mới",
  INVESTIGATING: "Đang xem xét",
  RESOLVED: "Đã hoàn tất",
  DISMISSED: "Không cần xử lý"
};

function one(parameters: URLSearchParams, key: string): string | null {
  const values = parameters.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function pageValue(value: string | null): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

export function defaultReportQueueState(): AdminReportQueueState {
  return { status: "OPEN", category: "", page: 1, reviewPriority: "" };
}

export function parseReportQueueState(source: ReportSource, parameters: URLSearchParams): AdminReportQueueState {
  const status = one(parameters, "status")?.trim().toUpperCase();
  const category = one(parameters, "category")?.trim().toUpperCase();
  const priority = one(parameters, "reviewPriority")?.trim().toUpperCase();
  return {
    status: statuses.includes(status as AnyReportStatus) ? (status as AnyReportStatus) : "OPEN",
    category: categories[source].includes(category ?? "") ? (category as AnyReportCategory) : "",
    page: pageValue(one(parameters, "page")),
    reviewPriority:
      source === "roommate" && (priority === "ELEVATED" || priority === "STANDARD")
        ? (priority as RoommateRiskPriority)
        : ""
  };
}

export function reportQueueUrl(source: ReportSource, state: AdminReportQueueState): string {
  const base = source === "listing" ? "/admin/reports" : `/admin/${source}-reports`;
  const parameters = new URLSearchParams();
  if (state.status !== "OPEN") parameters.set("status", state.status);
  if (state.category) parameters.set("category", state.category);
  if (source === "roommate" && state.reviewPriority) parameters.set("reviewPriority", state.reviewPriority);
  if (state.page > 1) parameters.set("page", String(state.page));
  const query = parameters.toString();
  return query ? `${base}?${query}` : base;
}

export function reportDetailUrl(source: ReportSource, reportId: number, state: AdminReportQueueState): string {
  const base = source === "listing" ? "/admin/reports" : `/admin/${source}-reports`;
  const queue = reportQueueUrl(source, state);
  const query = queue.split("?")[1];
  return query ? `${base}/${reportId}?${query}` : `${base}/${reportId}`;
}

export function reportReturnUrl(source: ReportSource, parameters: URLSearchParams): string {
  return reportQueueUrl(source, parseReportQueueState(source, parameters));
}

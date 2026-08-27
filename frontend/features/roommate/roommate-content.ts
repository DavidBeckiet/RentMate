import type {
  RoommateCleanlinessLevel,
  RoommateInterestStatus,
  RoommateNoisePreference,
  RoommatePetEnvironment,
  RoommateReportCategory,
  RoommateRequestStatus,
  RoommateSleepSchedule,
  RoommateSmokingEnvironment
} from "../../types/api";
import { ApiError } from "../../lib/api/client";

export const roommateSafetyCopy = Object.freeze({
  long: "RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch.",
  short: "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc.",
  checklist: [
    "Trao đổi qua RentMate trước.",
    "Xem phòng thực tế khi có thể.",
    "Xác nhận listing và điều kiện thuê với người cho thuê.",
    "Không chuyển tiền hoặc đặt cọc chỉ dựa vào tin nhắn.",
    "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính nhạy cảm.",
    "Báo cáo và ngừng tương tác nếu thấy hành vi đáng ngờ."
  ] as const,
  linkedMeaning: "Tenant đang tìm một người để cân nhắc cùng thuê listing này."
});

export const roommateSleepScheduleLabels: Record<RoommateSleepSchedule, string> = {
  EARLY: "Ngủ sớm, dậy sớm",
  STANDARD: "Lịch sinh hoạt thông thường",
  LATE: "Thường thức khuya",
  FLEXIBLE: "Linh hoạt"
};

export const roommateCleanlinessLabels: Record<RoommateCleanlinessLevel, string> = {
  RELAXED: "Thoải mái",
  BALANCED: "Cân bằng",
  TIDY: "Gọn gàng"
};

export const roommateNoiseLabels: Record<RoommateNoisePreference, string> = {
  QUIET: "Ưu tiên yên tĩnh",
  BALANCED: "Cân bằng",
  SOCIAL: "Thoải mái giao lưu"
};

export const roommateSmokingLabels: Record<RoommateSmokingEnvironment, string> = {
  SMOKE_FREE: "Không hút thuốc",
  OUTDOOR_ONLY: "Chỉ hút ở ngoài",
  NO_PREFERENCE: "Không có ưu tiên"
};

export const roommatePetLabels: Record<RoommatePetEnvironment, string> = {
  NO_PETS: "Không nuôi thú cưng",
  OK_WITH_PETS: "Ổn với thú cưng",
  HAS_PET: "Có nuôi thú cưng"
};

export const roommateRequestStatusLabels: Record<RoommateRequestStatus, string> = {
  OPEN: "Đang mở",
  MATCHED: "Đã kết nối",
  CANCELLED: "Đã hủy",
  EXPIRED: "Đã hết hạn"
};

export const roommateInterestStatusLabels: Record<RoommateInterestStatus, string> = {
  PENDING: "Đang chờ phản hồi",
  ACCEPTED: "Đã chấp nhận",
  REJECTED: "Đã từ chối",
  WITHDRAWN: "Đã rút lại",
  LEFT: "Đã kết thúc"
};

export const roommateReportCategoryLabels: Record<RoommateReportCategory, string> = {
  FRAUD: "Có dấu hiệu lừa đảo",
  PAYMENT_SCAM: "Yêu cầu thanh toán đáng ngờ",
  SPAM: "Spam",
  HARASSMENT: "Quấy rối",
  IMPERSONATION: "Mạo danh",
  INAPPROPRIATE_CONTENT: "Nội dung không phù hợp",
  OTHER: "Lý do khác"
};

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const roommateRequestReminderLeadMs = 3 * 24 * 60 * 60 * 1_000;

export function formatRoommateMoney(value: number): string {
  return vnd.format(value);
}

export function formatRoommateDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatRoommateDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function isRoommateRequestExpiring(expiresAt: string, now = new Date()): boolean {
  const expirationTime = new Date(expiresAt).getTime();
  const currentTime = now.getTime();
  return (
    Number.isFinite(expirationTime) &&
    Number.isFinite(currentTime) &&
    expirationTime > currentTime &&
    expirationTime - currentTime <= roommateRequestReminderLeadMs
  );
}

export function formatMemberSince(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", { month: "2-digit", year: "numeric" }).format(date);
}

export function dayInputValue(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseAreaKeys(value: string): readonly string[] {
  const normalized = value
    .split(/[\n,]/u)
    .map((item) => item.trim().replace(/\s+/gu, " "))
    .filter(Boolean);
  const values = new Map<string, string>();
  for (const item of normalized) {
    const key = item.toLocaleLowerCase("vi-VN");
    if (!values.has(key)) values.set(key, item);
  }
  return [...values.values()].slice(0, 5);
}

export function roommateErrorMessage(error: unknown): string {
  const apiError = error instanceof ApiError ? error : null;
  if (apiError?.code === "ROOMMATE_OPEN_REQUEST_EXISTS") return "Bạn đã có một yêu cầu tìm người ở ghép đang mở.";
  if (apiError?.code === "ROOMMATE_ACTIVE_CONNECTION_EXISTS") return "Bạn đang có một kết nối ở ghép đang hoạt động.";
  if (apiError?.code === "ROOMMATE_CANDIDATE_OPEN_REQUEST") {
    return "Người này cần đóng yêu cầu tìm người ở ghép của họ trước khi có thể kết nối.";
  }
  if (apiError?.code === "ROOMMATE_REQUEST_NOT_OPEN") {
    return "Yêu cầu này không còn ở trạng thái đang mở. Hãy tải lại trang trước khi tiếp tục.";
  }
  if (apiError?.code === "ROOMMATE_REQUEST_EXPIRED") return "Yêu cầu này đã hết hạn.";
  if (apiError?.code === "ROOMMATE_INTEREST_NOT_PENDING") {
    return "Lời quan tâm này không còn ở trạng thái chờ phản hồi. Hãy tải lại trang.";
  }
  if (apiError?.code === "ROOMMATE_LISTING_INELIGIBLE") {
    return "Listing này hiện không còn đủ điều kiện cho yêu cầu ở ghép.";
  }
  if (apiError?.code === "ROOMMATE_PENDING_INTEREST_LIMIT") {
    return "Bạn đang có tối đa 5 lời quan tâm chờ phản hồi. Hãy quản lý các lời quan tâm hiện có trước.";
  }
  if (apiError?.code === "CONCURRENT_MODIFICATION") {
    return "Dữ liệu vừa thay đổi. Hãy tải lại trang rồi thử lại.";
  }
  if (apiError?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (apiError?.status === 403) return "Tính năng ở ghép dành cho tài khoản người thuê đang hoạt động.";
  if (apiError?.status === 404) return "Nội dung ở ghép này hiện không còn khả dụng.";
  if (apiError?.status === 422 || apiError?.code === "VALIDATION_FAILED") {
    return "Kiểm tra lại thông tin đã nhập và thử lại.";
  }
  if (apiError?.status === 429 || apiError?.code === "RATE_LIMITED") {
    return "Bạn đang thao tác quá nhanh. Vui lòng thử lại sau.";
  }
  if (apiError?.status === 503 || apiError?.code === "DEPENDENCY_UNAVAILABLE") {
    return "Chưa thể xác nhận điều kiện cần thiết. Vui lòng thử lại sau.";
  }
  if (apiError?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  return "Chưa thể hoàn tất thao tác lúc này. Vui lòng thử lại.";
}

export function isTerminalRoommateInterest(status: RoommateInterestStatus): boolean {
  return status === "REJECTED" || status === "WITHDRAWN" || status === "LEFT";
}

export function paymentOrContactHint(value: string): boolean {
  return /\b(otp|mật khẩu|mat khau|chuyển tiền|chuyen tien|đặt cọc|dat coc|số tài khoản|so tai khoan)\b/iu.test(value);
}

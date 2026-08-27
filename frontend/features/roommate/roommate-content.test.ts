import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api/client";
import {
  isRoommateRequestExpiring,
  parseAreaKeys,
  paymentOrContactHint,
  roommateErrorMessage,
  roommateSafetyCopy
} from "./roommate-content";

describe("roommate content contracts", () => {
  it("keeps the approved payment warning and checklist copy intact", () => {
    expect(roommateSafetyCopy.long).toBe(
      "RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch."
    );
    expect(roommateSafetyCopy.short).toBe(
      "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc."
    );
    expect(roommateSafetyCopy.checklist).toEqual([
      "Trao đổi qua RentMate trước.",
      "Xem phòng thực tế khi có thể.",
      "Xác nhận listing và điều kiện thuê với người cho thuê.",
      "Không chuyển tiền hoặc đặt cọc chỉ dựa vào tin nhắn.",
      "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính nhạy cảm.",
      "Báo cáo và ngừng tương tác nếu thấy hành vi đáng ngờ."
    ]);
  });

  it("maps roommate conflicts to safe Vietnamese feedback without returning backend text", () => {
    expect(
      roommateErrorMessage(
        new ApiError({
          status: 409,
          code: "ROOMMATE_CANDIDATE_OPEN_REQUEST",
          message: "private service detail",
          category: "backend"
        })
      )
    ).toBe("Người này cần đóng yêu cầu tìm người ở ghép của họ trước khi có thể kết nối.");
    const fallback = roommateErrorMessage(
      new ApiError({ status: 500, code: "UNKNOWN", message: "private service detail", category: "backend" })
    );
    expect(fallback).not.toContain("private service detail");
  });

  it("normalizes area inputs for the form and only hints on sensitive wording", () => {
    expect(parseAreaKeys(" Quận 3,quận 3\n  Bình Thạnh ")).toEqual(["Quận 3", "Bình Thạnh"]);
    expect(paymentOrContactHint("Bạn có thể chuyển tiền trước không?")).toBe(true);
    expect(paymentOrContactHint("Mình muốn xem phòng vào cuối tuần.")).toBe(false);
  });

  it("uses the same three-day lead window as the request-expiry reminder", () => {
    const now = new Date("2026-08-27T00:00:00.000Z");
    expect(isRoommateRequestExpiring("2026-08-29T23:59:59.000Z", now)).toBe(true);
    expect(isRoommateRequestExpiring("2026-08-30T00:00:01.000Z", now)).toBe(false);
    expect(isRoommateRequestExpiring("2026-08-26T23:59:59.000Z", now)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { ApiError } from "../api/transport";
import { mapApiErrorToFields } from "./api-field-errors";

function validationError(details: ConstructorParameters<typeof ApiError>[0]["details"] = []) {
  return new ApiError({
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Dữ liệu gửi lên không hợp lệ.",
    requestId: "req-validation",
    details,
    category: "backend"
  });
}

describe("mapApiErrorToFields", () => {
  it("maps only recognized fields with safe detail messages", () => {
    const result = mapApiErrorToFields(
      validationError([{ field: "email", code: "INVALID_EMAIL", message: "Email không hợp lệ." }]),
      ["email", "phone"] as const
    );

    expect(result).toEqual({
      fieldErrors: { email: "Email không hợp lệ." },
      formMessage: null,
      requestId: "req-validation"
    });
  });

  it("keeps unknown fields at form level without leaking their detail message", () => {
    const result = mapApiErrorToFields(
      validationError([{ field: "internalFlag", code: "INVALID", message: "Private database detail" }]),
      ["email"] as const
    );

    expect(result.fieldErrors).toEqual({});
    expect(result.formMessage).toBe("Dữ liệu gửi lên không hợp lệ.");
    expect(JSON.stringify(result)).not.toContain("Private database detail");
  });

  it("uses the form fallback when details or detail messages are missing", () => {
    expect(mapApiErrorToFields(validationError(), ["email"] as const).formMessage).toBe(
      "Dữ liệu gửi lên không hợp lệ."
    );
    expect(
      mapApiErrorToFields(validationError([{ field: "email", code: "REQUIRED" }]), ["email"] as const).formMessage
    ).toBe("Dữ liệu gửi lên không hợp lệ.");
  });

  it("keeps the first message deterministically and retains fallback for additional unmapped details", () => {
    const result = mapApiErrorToFields(
      validationError([
        { field: "email", code: "FIRST", message: "Thông báo đầu tiên." },
        { field: "email", code: "SECOND", message: "Thông báo thứ hai." },
        { field: "unknown", code: "UNKNOWN", message: "Không hiển thị chi tiết này." }
      ]),
      ["email"] as const
    );

    expect(result.fieldErrors).toEqual({ email: "Thông báo đầu tiên." });
    expect(result.formMessage).toBe("Dữ liệu gửi lên không hợp lệ.");
    expect(result.requestId).toBe("req-validation");
  });
});

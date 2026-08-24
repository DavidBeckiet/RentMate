import { describe, expect, it } from "vitest";
import type { UserProfile } from "../../types/api";
import { validateProfileInput } from "./profile-validation";

const tenant: UserProfile = {
  id: 1,
  displayName: "Nguyễn Văn An",
  role: "TENANT",
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

describe("profile validation", () => {
  it("normalizes account names and allows an optional tenant phone", () => {
    expect(validateProfileInput({ displayName: "  Nguye\u0302\u0303n Văn An ", phone: "" }, tenant)).toEqual({
      valid: true,
      body: { displayName: "Nguyễn Văn An", phone: null }
    });
  });

  it("does not force a legacy null account to add a name before updating phone", () => {
    expect(validateProfileInput({ displayName: "", phone: "+84901234567" }, { ...tenant, displayName: null })).toEqual({
      valid: true,
      body: { phone: "+84901234567" }
    });
  });

  it("does not allow an existing account name to be cleared", () => {
    expect(validateProfileInput({ displayName: " ", phone: "" }, tenant)).toMatchObject({
      valid: false,
      errors: { displayName: "Vui lòng nhập họ và tên." }
    });
  });

  it("keeps landlord phone required without technical wording", () => {
    expect(
      validateProfileInput({ displayName: "Nguyễn Văn An", phone: "" }, { ...tenant, role: "LANDLORD" })
    ).toMatchObject({
      valid: false,
      errors: { phone: "Vui lòng nhập số điện thoại." }
    });
  });
});

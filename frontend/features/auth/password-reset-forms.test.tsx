import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PasswordResetConfirmationBody,
  PasswordResetRequestBody,
  PasswordResetRequestReceipt
} from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn<(body: PasswordResetRequestBody) => Promise<PasswordResetRequestReceipt>>(),
  confirmPasswordReset: vi.fn<(body: PasswordResetConfirmationBody) => Promise<void>>()
}));
const navigationMocks = vi.hoisted(() => ({ replace: vi.fn<(path: string) => void>() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      auth: {
        requestPasswordReset: apiMocks.requestPasswordReset,
        confirmPasswordReset: apiMocks.confirmPasswordReset
      }
    }
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: navigationMocks.replace }) }));

import { PasswordResetConfirmationForm, PasswordResetRequestForm } from "./password-reset-forms";

describe("password reset six-digit OTP flow", () => {
  beforeEach(() => {
    apiMocks.requestPasswordReset.mockReset();
    apiMocks.confirmPasswordReset.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("requests a code without account enumeration and continues with the normalized email", async () => {
    apiMocks.requestPasswordReset.mockResolvedValue({ accepted: true });
    render(<PasswordResetRequestForm />);

    fireEvent.change(screen.getByLabelText("Email tài khoản (bắt buộc)"), {
      target: { value: "  TENANT@EXAMPLE.TEST " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi mã 6 số" }));

    await waitFor(() => expect(apiMocks.requestPasswordReset).toHaveBeenCalledWith({ email: "tenant@example.test" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nếu email tồn tại");
    expect(screen.getByLabelText("Email tài khoản (bắt buộc)")).toHaveValue("tenant@example.test");
    expect(screen.getByLabelText("Mã đặt lại mật khẩu (bắt buộc)")).toHaveAttribute("maxlength", "6");
  });

  it("accepts digits only and submits email, six-digit code, and the new password", async () => {
    apiMocks.confirmPasswordReset.mockResolvedValue();
    render(<PasswordResetConfirmationForm initialEmail="tenant@example.test" />);

    const code = screen.getByLabelText("Mã đặt lại mật khẩu (bắt buộc)");
    fireEvent.change(code, { target: { value: "12a34b56" } });
    expect(code).toHaveValue("123456");
    fireEvent.change(screen.getByLabelText("Mật khẩu mới (bắt buộc)"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới (bắt buộc)"), {
      target: { value: "new-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() =>
      expect(apiMocks.confirmPasswordReset).toHaveBeenCalledWith({
        email: "tenant@example.test",
        code: "123456",
        password: "new-password"
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Mật khẩu đã được cập nhật");
  });

  it("rejects a reset code that is not exactly six digits before calling the API", () => {
    render(<PasswordResetConfirmationForm initialEmail="tenant@example.test" />);
    fireEvent.change(screen.getByLabelText("Mã đặt lại mật khẩu (bắt buộc)"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới (bắt buộc)"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới (bắt buộc)"), {
      target: { value: "new-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    expect(screen.getByRole("alert")).toHaveTextContent("đúng 6 số");
    expect(apiMocks.confirmPasswordReset).not.toHaveBeenCalled();
  });
});

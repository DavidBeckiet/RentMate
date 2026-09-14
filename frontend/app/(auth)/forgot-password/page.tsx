import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { PasswordResetRequestForm } from "../../../features/auth/password-reset-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      variant="recovery"
      title="Quên mật khẩu"
      description="Nhập email tài khoản để nhận mã đặt lại mật khẩu gồm 6 số."
      footer={null}
    >
      <PasswordResetRequestForm />
    </AuthPageShell>
  );
}

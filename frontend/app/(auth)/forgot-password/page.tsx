import Link from "next/link";
import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { PasswordResetRequestForm } from "../../../features/auth/password-reset-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      title="Quên mật khẩu"
      description="Nhập email tài khoản để nhận mã đặt lại mật khẩu gồm 6 số."
      footer={
        <p>
          Nhớ mật khẩu rồi?{" "}
          <Link
            href="/login"
            className="font-semibold text-teal-800 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            Đăng nhập
          </Link>
        </p>
      }
    >
      <PasswordResetRequestForm />
    </AuthPageShell>
  );
}

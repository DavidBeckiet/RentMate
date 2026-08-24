import Link from "next/link";
import { AuthPageShell } from "../../../features/auth/auth-page-shell";
import { LoginForm } from "../../../features/auth/login-form";

const secondaryLinkClasses =
  "font-semibold text-teal-800 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2";

export default function LoginPage() {
  return (
    <AuthPageShell
      variant="login"
      title="Đăng nhập"
      description="Chào mừng bạn quay lại."
      footer={
        <p>
          Chưa có tài khoản?{" "}
          <Link href="/register" className={secondaryLinkClasses}>
            Đăng ký
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthPageShell>
  );
}

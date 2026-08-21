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
      description="Dùng email và mật khẩu của bạn để tiếp tục với RentMate."
      footer={
        <div className="space-y-3">
          <p>Chưa có tài khoản?</p>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:gap-5">
            <Link href="/register/tenant" className={secondaryLinkClasses}>
              Đăng ký tìm phòng
            </Link>
            <Link href="/register/landlord" className={secondaryLinkClasses}>
              Đăng ký cho thuê
            </Link>
          </div>
        </div>
      }
    >
      <LoginForm />
    </AuthPageShell>
  );
}

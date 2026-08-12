import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { RegistrationForm } from "../../../../features/auth/registration-form";

export default function LandlordRegistrationPage() {
  return (
    <AuthPageShell
      title="Đăng ký cho thuê"
      description="Tạo tài khoản chủ trọ để chuẩn bị đăng và quản lý thông tin chỗ ở của bạn."
      footer={
        <p>
          Đã có tài khoản?{" "}
          <Link
            href="/login"
            className="font-semibold text-teal-800 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            Đăng nhập
          </Link>
        </p>
      }
    >
      <RegistrationForm mode="landlord" />
    </AuthPageShell>
  );
}

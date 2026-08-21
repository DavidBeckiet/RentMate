import Link from "next/link";
import { AuthPageShell } from "../../../../features/auth/auth-page-shell";
import { RegistrationForm } from "../../../../features/auth/registration-form";

export default function TenantRegistrationPage() {
  return (
    <AuthPageShell
      variant="tenant"
      title="Đăng ký tìm phòng"
      description="Tạo tài khoản người thuê để tìm chỗ ở và sử dụng các tiện ích dành cho người thuê."
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
      <RegistrationForm mode="tenant" />
    </AuthPageShell>
  );
}

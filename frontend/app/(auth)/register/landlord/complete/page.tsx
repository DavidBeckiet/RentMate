import Link from "next/link";
import { AuthPageShell } from "../../../../../features/auth/auth-page-shell";
import { GoogleLandlordCompletionForm } from "../../../../../features/auth/google-landlord-completion-form";

export default function GoogleLandlordCompletionPage() {
  return (
    <AuthPageShell
      variant="landlord"
      title="Hoàn tất hồ sơ chủ trọ"
      description="Google đã xác minh email của bạn. Chỉ còn một bước để bắt đầu đăng tin cho thuê."
      footer={
        <div className="space-y-2">
          <p>
            Muốn dùng email và mật khẩu? <Link href="/register/landlord">Đăng ký theo cách thường</Link>
          </p>
          <p>
            Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
          </p>
        </div>
      }
    >
      <GoogleLandlordCompletionForm />
    </AuthPageShell>
  );
}

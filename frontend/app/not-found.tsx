import Link from "next/link";
import { buttonClassName } from "../components/ui/button-styles";
import { EmptyState } from "../components/ui/feedback-states";
import { Icon } from "../components/ui/icon";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <EmptyState
        title="Không tìm thấy trang"
        description="Đường dẫn này không tồn tại hoặc nội dung đã được chuyển sang vị trí khác."
        visual={<Icon name="search" className="h-8 w-8" />}
        action={
          <Link href="/search" className={buttonClassName("primary", "md")}>
            Tìm phòng trên RentMate
          </Link>
        }
      />
    </div>
  );
}

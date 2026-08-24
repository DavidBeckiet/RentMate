"use client";

import { ErrorState } from "../components/ui/feedback-states";

export default function RouteError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <ErrorState
        title="Trang chưa thể hiển thị"
        message="Đã có lỗi ngoài dự kiến. Bạn có thể thử tải lại phần nội dung này."
        onRetry={reset}
      />
    </div>
  );
}

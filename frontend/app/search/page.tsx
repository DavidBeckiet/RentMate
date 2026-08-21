import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "../../components/ui/feedback-states";
import { SearchPage } from "../../features/listings/search-page";

export const metadata: Metadata = {
  title: "Tìm phòng | RentMate",
  description: "Tìm và lọc phòng trọ công khai theo khu vực, ngân sách, tiện ích hoặc bản đồ."
};

export default function PublicSearchPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở trang tìm phòng…" />}>
      <SearchPage />
    </Suspense>
  );
}

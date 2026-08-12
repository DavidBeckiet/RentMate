import { Suspense } from "react";
import { LoadingState } from "../components/ui/feedback-states";
import { SearchPage } from "../features/listings/search-page";

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở trang tìm phòng…" />}>
      <SearchPage />
    </Suspense>
  );
}

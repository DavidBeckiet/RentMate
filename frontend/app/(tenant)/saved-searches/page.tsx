import { Suspense } from "react";
import { LoadingState } from "../../../components/ui/feedback-states";
import { SavedSearchesPage } from "../../../features/saved-searches/saved-searches-page";

export default function SavedSearchesRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở bộ lọc đã lưu…" />}>
      <SavedSearchesPage />
    </Suspense>
  );
}

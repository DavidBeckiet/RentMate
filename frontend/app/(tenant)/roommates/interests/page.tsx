import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { RoommateInterestsPage } from "../../../../features/roommate/roommate-interests-page";

export default function RoommateInterestsRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở lời quan tâm ở ghép…" />}>
      <RoommateInterestsPage />
    </Suspense>
  );
}

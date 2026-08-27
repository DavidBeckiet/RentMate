import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { RoommateRequestPage } from "../../../../features/roommate/roommate-request-page";

export default function RoommateRequestRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở yêu cầu ở ghép…" />}>
      <RoommateRequestPage />
    </Suspense>
  );
}

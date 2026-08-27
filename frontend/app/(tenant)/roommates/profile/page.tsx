import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { RoommateProfilePage } from "../../../../features/roommate/roommate-profile-page";

export default function RoommateProfileRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở hồ sơ ở ghép…" />}>
      <RoommateProfilePage />
    </Suspense>
  );
}

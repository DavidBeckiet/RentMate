import { RoommateRequestDetailPage } from "../../../../../features/roommate/roommate-request-detail-page";

export default async function RoommateRequestDetailRoute({
  params
}: Readonly<{ params: Promise<{ requestId: string }> }>) {
  const { requestId } = await params;
  return <RoommateRequestDetailPage requestId={requestId} />;
}

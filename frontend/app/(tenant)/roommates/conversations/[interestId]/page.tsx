import { RoommateConversationPage } from "../../../../../features/roommate/roommate-conversation-page";

export default async function RoommateConversationRoute({
  params
}: Readonly<{ params: Promise<{ interestId: string }> }>) {
  const { interestId } = await params;
  return <RoommateConversationPage interestId={interestId} />;
}

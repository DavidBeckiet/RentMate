import { InquiryDetailPage } from "../../../features/contact/inquiry-detail-page";

export default async function InquiryDetailRoute({ params }: Readonly<{ params: Promise<{ inquiryId: string }> }>) {
  const { inquiryId } = await params;
  return <InquiryDetailPage inquiryId={inquiryId} />;
}

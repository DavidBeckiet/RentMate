import { OwnerListingDetail } from "../../../../../features/listings/owner-listing-detail";

export default async function OwnerListingDetailRoute({
  params
}: Readonly<{ params: Promise<{ listingId: string }> }>) {
  const { listingId } = await params;
  return <OwnerListingDetail listingId={listingId} />;
}

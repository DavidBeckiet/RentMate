import { FavoriteSaveControl } from "../../../features/favorites/favorite-save-control";
import { ListingDetail } from "../../../features/listings/listing-detail";

export default async function PublicListingDetailPage({
  params
}: Readonly<{ params: Promise<{ listingId: string }> }>) {
  const { listingId } = await params;
  return <ListingDetail listingId={listingId} actions={<FavoriteSaveControl listingId={listingId} />} />;
}

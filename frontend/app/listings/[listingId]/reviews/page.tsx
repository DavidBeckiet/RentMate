import { ListingReviewsPage } from "../../../../features/reviews/listing-reviews-page";
import { normalizeReviewPage } from "../../../../features/reviews/review-page-utils";

export default async function PublicListingReviewsRoute({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ page?: string | string[] | undefined }>;
}>) {
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;

  return <ListingReviewsPage listingId={listingId} page={normalizeReviewPage(rawPage)} />;
}

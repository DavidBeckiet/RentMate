import { redirect } from "next/navigation";
import { AdminOverviewPage } from "../../../features/admin-overview/admin-overview-page";
import { legacyAdminListingsUrl } from "../../../features/listings/admin-listing-query";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminDashboardRoute({
  searchParams
}: Readonly<{
  searchParams: Promise<DashboardSearchParams>;
}>) {
  const legacyQueueUrl = legacyAdminListingsUrl(await searchParams);
  if (legacyQueueUrl) redirect(legacyQueueUrl);
  return <AdminOverviewPage />;
}

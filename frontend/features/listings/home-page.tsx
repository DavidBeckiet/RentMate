"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api/client";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { MarketplaceHome } from "./marketplace-home";
import {
  applySearchFilters,
  serializeSearchState,
  type SearchFilterValues,
  type SearchQueryState
} from "./search-query";

type LoadStatus = "idle" | "loading" | "success" | "error";

const initialSearchState: SearchQueryState = {
  mode: "ordinary",
  amenities: [],
  page: 1,
  pageSize: 15,
  sort: "newest"
};

function homeListingError(error: ApiError | null): string {
  if (error?.code === "NETWORK_ERROR") return "Máy chủ dữ liệu hiện chưa kết nối.";
  return "Chưa thể tải danh sách phòng mới nhất.";
}

export function HomePageExperience() {
  const router = useRouter();
  const [propertyTypes, setPropertyTypes] = useState<readonly PropertyType[]>([]);
  const [propertyTypesLoading, setPropertyTypesLoading] = useState(true);
  const [listings, setListings] = useState<ApiPage<PublicListingSummary> | null>(null);
  const [listingsStatus, setListingsStatus] = useState<LoadStatus>("idle");
  const [listingsError, setListingsError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setPropertyTypesLoading(true);
    void api.lookups
      .listPropertyTypes(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPropertyTypes(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPropertyTypes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPropertyTypesLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setListingsStatus("loading");
    setListingsError(null);
    void api.listings
      .searchPublic({ page: 1, pageSize: 4, sort: "newest" }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setListings(page);
        setListingsStatus("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setListings(null);
        setListingsError(caught instanceof ApiError ? caught : null);
        setListingsStatus("error");
      });
    return () => controller.abort();
  }, [retryKey]);

  const openSearch = (filters: SearchFilterValues) => {
    const state = applySearchFilters(initialSearchState, filters, "newest");
    const query = serializeSearchState(state).toString();
    router.push(query ? `/search?${query}` : "/search");
  };

  return (
    <MarketplaceHome
      propertyTypes={propertyTypes}
      propertyTypesLoading={propertyTypesLoading}
      listings={listings}
      listingsStatus={listingsStatus}
      listingsError={listingsStatus === "error" ? homeListingError(listingsError) : null}
      onSearch={openSearch}
      onRetryListings={() => setRetryKey((key) => key + 1)}
    />
  );
}

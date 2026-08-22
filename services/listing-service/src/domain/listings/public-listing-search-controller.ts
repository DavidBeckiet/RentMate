import type { RequestHandler } from "express";
import { sendPaginated } from "../../../../shared/src/runtime/shared/http/responses.js";
import { validatePublicListingSearch, validatePublicListingSearchBody } from "./public-listing-search-validation.js";
import type { PublicListingSearchService } from "./public-listing-search-service.js";

export function createPublicListingSearchHandler(service: PublicListingSearchService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const query = validatePublicListingSearch(request.query);
      validatePublicListingSearchBody(request.body);
      const page = await service.search(query);
      sendPaginated(response, page.summaries, {
        page: page.page,
        pageSize: page.pageSize,
        hasNextPage: page.hasNextPage
      });
    })().catch(next);
  };
}

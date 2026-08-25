import type { CreateReviewReportBody, ReviewReportReceipt } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createReviewsApi(transport: ApiTransport) {
  return {
    report: (reviewId: number, body: CreateReviewReportBody, signal?: AbortSignal): Promise<ReviewReportReceipt> =>
      transport.object(`/api/v1/reviews/${reviewId}/reports`, { method: "POST", json: body, signal })
  } as const;
}

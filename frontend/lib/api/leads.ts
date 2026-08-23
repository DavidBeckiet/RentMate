import type { ApiPage, LandlordLead, LeadNoteState, LeadQuery, LeadReminderState } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createLeadsApi(transport: ApiTransport) {
  return {
    list: (query: LeadQuery = {}, signal?: AbortSignal): Promise<ApiPage<LandlordLead>> =>
      transport.page("/api/v1/landlord/leads", { query, signal }),
    saveNote: (inquiryId: number, note: string | null, signal?: AbortSignal): Promise<LeadNoteState> =>
      transport.object(`/api/v1/landlord/leads/${inquiryId}/note`, {
        method: "PATCH",
        json: { note },
        signal
      }),
    saveReminder: (inquiryId: number, remindAt: string | null, signal?: AbortSignal): Promise<LeadReminderState> =>
      transport.object(`/api/v1/landlord/leads/${inquiryId}/reminder`, {
        method: "PATCH",
        json: { remindAt },
        signal
      })
  } as const;
}

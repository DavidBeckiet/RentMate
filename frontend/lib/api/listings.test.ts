import { describe, expect, it } from "vitest";
import type { ApiTransport } from "./transport";
import { createListingsApi } from "./listings";

function recordingTransport() {
  const calls: Array<{ readonly path: string; readonly options: unknown }> = [];
  const transport: ApiTransport = {
    raw: async () => undefined as never,
    object: async (path, options) => {
      calls.push({ path, options });
      return undefined as never;
    },
    page: async () => undefined as never,
    void: async () => undefined
  };
  return { calls, transport };
}

describe("listings API", () => {
  it("maps landlord duplication to a bodyless POST", async () => {
    const { calls, transport } = recordingTransport();
    const signal = new AbortController().signal;

    await createListingsApi(transport).duplicate(42, signal);

    expect(calls).toEqual([
      {
        path: "/api/v1/landlord/listings/42/duplicate",
        options: { method: "POST", signal }
      }
    ]);
  });
});

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("renders the existing skeleton and reports mocked backend health", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", database: "connected" })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "RentMate" })).toBeInTheDocument();
    expect(screen.getByText("Project skeleton")).toBeInTheDocument();
    expect(await screen.findByText(/Backend: ok/)).toHaveTextContent("Backend: ok · Database: connected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

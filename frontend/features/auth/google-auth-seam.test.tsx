import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ startGoogle: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { auth: { startGoogle: apiMocks.startGoogle } } };
});

import { GoogleAuthSeam } from "./google-auth-seam";

describe("GoogleAuthSeam", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    apiMocks.startGoogle.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts login with the typed API boundary and redirects to the provider", async () => {
    const redirect = vi.fn();
    apiMocks.startGoogle.mockResolvedValue({ redirectUrl: "https://accounts.google.com/oauth" });
    render(<GoogleAuthSeam mode="login" onRedirect={redirect} />);

    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập nhanh bằng Google" }));

    await waitFor(() => expect(apiMocks.startGoogle).toHaveBeenCalledWith({ intent: "LOGIN" }));
    expect(redirect).toHaveBeenCalledWith("https://accounts.google.com/oauth");
  });

  it("sends the landlord phone in the signed OAuth-start request", async () => {
    const redirect = vi.fn();
    apiMocks.startGoogle.mockResolvedValue({ redirectUrl: "https://accounts.google.com/oauth" });
    render(<GoogleAuthSeam mode="register" role="LANDLORD" phone=" +84901234567 " onRedirect={redirect} />);

    fireEvent.click(screen.getByRole("button", { name: "Đăng ký nhanh bằng Google" }));

    await waitFor(() =>
      expect(apiMocks.startGoogle).toHaveBeenCalledWith({
        intent: "REGISTER",
        role: "LANDLORD",
        phone: "+84901234567"
      })
    );
  });
});

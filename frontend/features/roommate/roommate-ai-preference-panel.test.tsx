import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const roommateMocks = vi.hoisted(() => ({ getAiCapabilities: vi.fn(), createPreferencePreview: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: roommateMocks } };
});

import { RoommateAiPreferencePanel } from "./roommate-ai-preference-panel";

describe("RoommateAiPreferencePanel", () => {
  beforeEach(() => {
    roommateMocks.getAiCapabilities.mockReset();
    roommateMocks.createPreferencePreview.mockReset();
  });

  it("stays absent when the capability is disabled", async () => {
    roommateMocks.getAiCapabilities.mockResolvedValue({ preferenceParsing: false });
    render(<RoommateAiPreferencePanel target="PROFILE" onApply={vi.fn()} />);
    await waitFor(() => expect(roommateMocks.getAiCapabilities).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Phân tích nhu cầu bằng AI" })).not.toBeInTheDocument();
  });

  it("requires an explicit parse and applies only selected non-low proposals locally", async () => {
    const onApply = vi.fn();
    roommateMocks.getAiCapabilities.mockResolvedValue({ preferenceParsing: true });
    roommateMocks.createPreferencePreview.mockResolvedValue({
      target: "PROFILE",
      normalizedText: "Mình thích nhà yên tĩnh và dậy sớm mỗi ngày.",
      proposal: {
        noisePreference: { value: "QUIET", confidence: "HIGH", evidenceRanges: [{ start: 11, end: 20 }] },
        sleepSchedule: { value: "EARLY", confidence: "LOW", evidenceRanges: [{ start: 25, end: 32 }] }
      },
      unresolved: [{ reason: "SENSITIVE_OR_PROTECTED_ATTRIBUTE", evidenceRanges: [{ start: 0, end: 4 }] }],
      requiresConfirmation: true,
      parserVersion: "ROOMMATE_AI_PARSER_V3_1",
      promptVersion: "ROOMMATE_AI_PARSER_PROMPT_V1"
    });
    render(<RoommateAiPreferencePanel target="PROFILE" onApply={onApply} />);
    const text = await screen.findByLabelText("Mô tả nhu cầu");
    fireEvent.change(text, { target: { value: "Mình thích nhà yên tĩnh và dậy sớm mỗi ngày." } });
    fireEvent.click(screen.getByRole("button", { name: "Phân tích bằng AI" }));
    await screen.findByText("Ưu tiên không gian");
    expect(roommateMocks.createPreferencePreview).toHaveBeenCalledWith({
      target: "PROFILE",
      text: "Mình thích nhà yên tĩnh và dậy sớm mỗi ngày.",
      locale: "vi"
    });
    expect(screen.getByText(/Thông tin nhạy cảm/)).toBeInTheDocument();
    const low = screen.getByLabelText("Nhịp sinh hoạt") as HTMLInputElement;
    expect(low.checked).toBe(false);
    fireEvent.change(screen.getByLabelText("Chỉnh sửa Ưu tiên không gian"), { target: { value: "SOCIAL" } });
    fireEvent.click(screen.getByRole("button", { name: "Dùng đề xuất" }));
    expect(onApply).toHaveBeenCalledWith({ noisePreference: "SOCIAL" });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { VoiceSelector } from "#webui/components/settings/controls/VoiceSelector";

describe("VoiceSelector", () => {
  it("renders the saved voice and all options", () => {
    render(
      <VoiceSelector voice="marin" setVoice={vi.fn()} activeVoice={null} />,
    );

    const select = screen.getByTestId("voice-select") as HTMLSelectElement;

    expect(select.value).toBe("marin");
    expect(screen.getByRole("option", { name: /Marin/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Cedar/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Shimmer/ })).toBeTruthy();
  });

  it("calls setVoice when a new option is selected", () => {
    const setVoice = vi.fn();

    render(
      <VoiceSelector voice="marin" setVoice={setVoice} activeVoice={null} />,
    );

    fireEvent.change(screen.getByTestId("voice-select"), {
      target: { value: "cedar" },
    });
    expect(setVoice).toHaveBeenCalledWith("cedar");
  });

  it("hides the pending-change notice when activeVoice matches", () => {
    render(
      <VoiceSelector voice="marin" setVoice={vi.fn()} activeVoice="marin" />,
    );

    expect(screen.queryByText(/applies on the next session/i)).toBeNull();
  });

  it("hides the pending-change notice when no session is active", () => {
    render(
      <VoiceSelector voice="cedar" setVoice={vi.fn()} activeVoice={null} />,
    );

    expect(screen.queryByText(/applies on the next session/i)).toBeNull();
  });

  it("shows the pending-change notice when the saved voice diverges from the active session", () => {
    render(
      <VoiceSelector voice="cedar" setVoice={vi.fn()} activeVoice="marin" />,
    );

    const notice = screen.getByText(/applies on the next session/i);

    expect(notice.textContent).toContain('Active session is using "marin"');
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { VoiceVolumeSlider } from "#webui/components/settings/controls/VoiceVolumeSlider";

describe("VoiceVolumeSlider", () => {
  it("renders the current volume as a percentage in the label", () => {
    render(<VoiceVolumeSlider volume={0.8} setVolume={vi.fn()} />);

    expect(screen.getByText(/Volume \(80%\)/)).toBeTruthy();
  });

  it("calls setVolume with the parsed numeric value on slider input", () => {
    const setVolume = vi.fn();

    render(<VoiceVolumeSlider volume={1.0} setVolume={setVolume} />);

    fireEvent.input(screen.getByTestId("voice-volume-slider"), {
      target: { value: "0.5" },
    });

    expect(setVolume).toHaveBeenCalledWith(0.5);
  });

  it("resets volume to 100% when the reset button is clicked", () => {
    const setVolume = vi.fn();

    render(<VoiceVolumeSlider volume={0.4} setVolume={setVolume} />);

    fireEvent.click(screen.getByText(/Reset to 100%/));
    expect(setVolume).toHaveBeenCalledWith(1.0);
  });
});

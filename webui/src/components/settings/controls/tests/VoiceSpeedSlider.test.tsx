// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { VoiceSpeedSlider } from "#webui/components/settings/controls/VoiceSpeedSlider";

describe("VoiceSpeedSlider", () => {
  it("renders the current speed value in the label", () => {
    render(<VoiceSpeedSlider speed={1.25} setSpeed={vi.fn()} />);

    expect(screen.getByText(/Speed \(1\.25x\)/)).toBeTruthy();
  });

  it("calls setSpeed with the parsed numeric value on slider input", () => {
    const setSpeed = vi.fn();

    render(<VoiceSpeedSlider speed={1.0} setSpeed={setSpeed} />);

    fireEvent.input(screen.getByTestId("voice-speed-slider"), {
      target: { value: "0.75" },
    });

    expect(setSpeed).toHaveBeenCalledWith(0.75);
  });

  it("resets speed to 1.0 when the reset button is clicked", () => {
    const setSpeed = vi.fn();

    render(<VoiceSpeedSlider speed={1.4} setSpeed={setSpeed} />);

    fireEvent.click(screen.getByText("Reset"));
    expect(setSpeed).toHaveBeenCalledWith(1.0);
  });
});

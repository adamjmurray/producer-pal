// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { TurnDetectionControls } from "#webui/components/settings/controls/TurnDetectionControls";
import {
  DEFAULT_TURN_DETECTION,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";

const serverVad: TurnDetectionSettings = {
  mode: "server_vad",
  threshold: 0.5,
  silenceDurationMs: 200,
  eagerness: "auto",
  interruptResponse: false,
};

const semanticVad: TurnDetectionSettings = {
  ...DEFAULT_TURN_DETECTION,
  mode: "semantic_vad",
  eagerness: "medium",
};

describe("TurnDetectionControls", () => {
  it("renders the Advanced disclosure summary", () => {
    render(
      <TurnDetectionControls settings={serverVad} setSettings={vi.fn()} />,
    );

    expect(screen.getByText("Advanced")).toBeTruthy();
  });

  it("shows the threshold + silence sliders for server VAD, not eagerness", () => {
    render(
      <TurnDetectionControls settings={serverVad} setSettings={vi.fn()} />,
    );

    expect(screen.getByTestId("turn-detection-threshold")).toBeTruthy();
    expect(screen.getByTestId("turn-detection-silence")).toBeTruthy();
    expect(screen.queryByTestId("turn-detection-eagerness")).toBeNull();
    expect(screen.getByText("Threshold (0.50)")).toBeTruthy();
    expect(screen.getByText("Silence (200 ms)")).toBeTruthy();
  });

  it("shows the eagerness dropdown for semantic VAD, not the sliders", () => {
    render(
      <TurnDetectionControls settings={semanticVad} setSettings={vi.fn()} />,
    );

    const eagerness = screen.getByTestId(
      "turn-detection-eagerness",
    ) as HTMLSelectElement;

    expect(eagerness.value).toBe("medium");
    expect(screen.queryByTestId("turn-detection-threshold")).toBeNull();
    expect(screen.queryByTestId("turn-detection-silence")).toBeNull();
  });

  it("updates the mode when the mode select changes", () => {
    const setSettings = vi.fn();

    render(
      <TurnDetectionControls settings={serverVad} setSettings={setSettings} />,
    );

    fireEvent.change(screen.getByTestId("turn-detection-mode"), {
      target: { value: "semantic_vad" },
    });

    expect(setSettings).toHaveBeenCalledWith({
      ...serverVad,
      mode: "semantic_vad",
    });
  });

  it("updates eagerness from the dropdown", () => {
    const setSettings = vi.fn();

    render(
      <TurnDetectionControls
        settings={semanticVad}
        setSettings={setSettings}
      />,
    );

    fireEvent.change(screen.getByTestId("turn-detection-eagerness"), {
      target: { value: "low" },
    });

    expect(setSettings).toHaveBeenCalledWith({
      ...semanticVad,
      eagerness: "low",
    });
  });

  it("updates threshold and silence from the sliders", () => {
    const setSettings = vi.fn();

    render(
      <TurnDetectionControls settings={serverVad} setSettings={setSettings} />,
    );

    fireEvent.input(screen.getByTestId("turn-detection-threshold"), {
      target: { value: "0.8" },
    });
    expect(setSettings).toHaveBeenCalledWith({ ...serverVad, threshold: 0.8 });

    fireEvent.input(screen.getByTestId("turn-detection-silence"), {
      target: { value: "500" },
    });
    expect(setSettings).toHaveBeenCalledWith({
      ...serverVad,
      silenceDurationMs: 500,
    });
  });

  it("renders the barge-in toggle reflecting interruptResponse, unchecked by default", () => {
    render(
      <TurnDetectionControls settings={serverVad} setSettings={vi.fn()} />,
    );

    const toggle = screen.getByTestId(
      "turn-detection-barge-in",
    ) as HTMLInputElement;

    expect(toggle.checked).toBe(false);
  });

  it("enables barge-in when the toggle is checked", () => {
    const setSettings = vi.fn();

    render(
      <TurnDetectionControls settings={serverVad} setSettings={setSettings} />,
    );

    fireEvent.click(screen.getByTestId("turn-detection-barge-in"));

    expect(setSettings).toHaveBeenCalledWith({
      ...serverVad,
      interruptResponse: true,
    });
  });
});

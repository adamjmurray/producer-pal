// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { GeminiTurnDetectionControls } from "#webui/components/settings/controls/GeminiTurnDetectionControls";
import {
  DEFAULT_GEMINI_VAD,
  DEFAULT_TURN_DETECTION,
} from "#webui/hooks/settings/turn-detection-helpers";

const settings = DEFAULT_TURN_DETECTION;

describe("GeminiTurnDetectionControls", () => {
  it("renders all four VAD controls plus the barge-in toggle", () => {
    render(
      <GeminiTurnDetectionControls settings={settings} setSettings={vi.fn()} />,
    );

    expect(screen.getByTestId("gemini-start-sensitivity")).toBeTruthy();
    expect(screen.getByTestId("gemini-end-sensitivity")).toBeTruthy();
    expect(screen.getByTestId("gemini-silence")).toBeTruthy();
    expect(screen.getByTestId("gemini-prefix")).toBeTruthy();
    expect(
      screen.getByText(`Silence (${DEFAULT_GEMINI_VAD.silenceDurationMs} ms)`),
    ).toBeTruthy();
    expect(
      screen.getByText(
        `Prefix padding (${DEFAULT_GEMINI_VAD.prefixPaddingMs} ms)`,
      ),
    ).toBeTruthy();
  });

  it("reflects the barge-in default (on for Gemini)", () => {
    render(
      <GeminiTurnDetectionControls settings={settings} setSettings={vi.fn()} />,
    );

    const toggle = screen.getByTestId("gemini-barge-in") as HTMLInputElement;

    expect(toggle.checked).toBe(true);
  });

  it("updates start-of-speech sensitivity", () => {
    const setSettings = vi.fn();

    render(
      <GeminiTurnDetectionControls
        settings={settings}
        setSettings={setSettings}
      />,
    );

    fireEvent.change(screen.getByTestId("gemini-start-sensitivity"), {
      target: { value: "high" },
    });

    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      gemini: { ...settings.gemini, startSensitivity: "high" },
    });
  });

  it("updates end-of-speech sensitivity", () => {
    const setSettings = vi.fn();

    render(
      <GeminiTurnDetectionControls
        settings={settings}
        setSettings={setSettings}
      />,
    );

    fireEvent.change(screen.getByTestId("gemini-end-sensitivity"), {
      target: { value: "high" },
    });

    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      gemini: { ...settings.gemini, endSensitivity: "high" },
    });
  });

  it("updates silence and prefix padding from the sliders", () => {
    const setSettings = vi.fn();

    render(
      <GeminiTurnDetectionControls
        settings={settings}
        setSettings={setSettings}
      />,
    );

    fireEvent.input(screen.getByTestId("gemini-silence"), {
      target: { value: "1200" },
    });
    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      gemini: { ...settings.gemini, silenceDurationMs: 1200 },
    });

    fireEvent.input(screen.getByTestId("gemini-prefix"), {
      target: { value: "150" },
    });
    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      gemini: { ...settings.gemini, prefixPaddingMs: 150 },
    });
  });

  it("toggles barge-in off", () => {
    const setSettings = vi.fn();

    render(
      <GeminiTurnDetectionControls
        settings={settings}
        setSettings={setSettings}
      />,
    );

    fireEvent.click(screen.getByTestId("gemini-barge-in"));

    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      gemini: { ...settings.gemini, interruptResponse: false },
    });
  });

  it("resets silence to its default via the Reset link", () => {
    const setSettings = vi.fn();
    const tuned = {
      ...settings,
      gemini: { ...settings.gemini, silenceDurationMs: 1500 },
    };

    render(
      <GeminiTurnDetectionControls
        settings={tuned}
        setSettings={setSettings}
      />,
    );

    fireEvent.click(screen.getByTestId("gemini-silence-reset"));

    expect(setSettings).toHaveBeenCalledWith({
      ...tuned,
      gemini: {
        ...tuned.gemini,
        silenceDurationMs: DEFAULT_GEMINI_VAD.silenceDurationMs,
      },
    });
  });
});

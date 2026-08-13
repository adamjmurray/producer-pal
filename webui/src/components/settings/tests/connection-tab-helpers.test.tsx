// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  SmallModelToggle,
  ThinkingSelector,
  VoiceSettings,
} from "#webui/components/settings/helpers/connection-tab-helpers";
import {
  GEMINI_REALTIME_MODEL,
  OPENAI_REALTIME_MODEL,
} from "#webui/lib/constants/models";
import { makeVoiceSettingsProps } from "./settings-voice-props-test-helpers";

describe("ThinkingSelector", () => {
  it("calls setThinking when a new option is selected", () => {
    const setThinking = vi.fn();

    render(<ThinkingSelector thinking="Default" setThinking={setThinking} />);

    const select = screen.getByRole("combobox");

    fireEvent.change(select, { target: { value: "Max" } });

    expect(setThinking).toHaveBeenCalledWith("Max");
  });

  it("renders with the current thinking value selected", () => {
    render(<ThinkingSelector thinking="Off" setThinking={vi.fn()} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;

    expect(select.value).toBe("Off");
  });
});

describe("SmallModelToggle", () => {
  it("calls setSmallModelMode when checkbox is toggled on", () => {
    const setSmallModelMode = vi.fn();

    render(
      <SmallModelToggle
        smallModelMode={false}
        setSmallModelMode={setSmallModelMode}
      />,
    );

    const checkbox = screen.getByRole("checkbox");

    fireEvent.change(checkbox, { target: { checked: true } });

    expect(setSmallModelMode).toHaveBeenCalledWith(true);
  });

  it("calls setSmallModelMode when checkbox is toggled off", () => {
    const setSmallModelMode = vi.fn();

    render(
      <SmallModelToggle
        smallModelMode={true}
        setSmallModelMode={setSmallModelMode}
      />,
    );

    const checkbox = screen.getByRole("checkbox");

    fireEvent.change(checkbox, { target: { checked: false } });

    expect(setSmallModelMode).toHaveBeenCalledWith(false);
  });
});

describe("VoiceSettings", () => {
  const realtimeProps = {
    provider: "openai" as const,
    model: OPENAI_REALTIME_MODEL,
    ...makeVoiceSettingsProps(),
  };

  it("renders nothing for a non-realtime selection", () => {
    const { container } = render(
      <VoiceSettings
        {...realtimeProps}
        provider="gemini"
        model="gemini-2.5-pro"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("keeps the voice and language selectors outside the 'Voice Settings' disclosure", () => {
    render(<VoiceSettings {...realtimeProps} />);

    expect(screen.getByText("Voice Settings")).toBeTruthy();
    expect(screen.queryByText("Advanced")).toBeNull();
    expect(screen.getByTestId("voice-select").closest("details")).toBeNull();
    expect(
      screen.getByTestId("voice-language-select").closest("details"),
    ).toBeNull();
  });

  it("renders the language selector for both providers", () => {
    const { unmount } = render(<VoiceSettings {...realtimeProps} />);

    expect(
      (screen.getByTestId("voice-language-select") as HTMLSelectElement).value,
    ).toBe("en");
    unmount();

    render(
      <VoiceSettings
        {...realtimeProps}
        provider="gemini"
        model={GEMINI_REALTIME_MODEL}
        realtimeVoice="Puck"
      />,
    );

    expect(screen.getByTestId("voice-language-select")).toBeTruthy();
  });

  it("calls setVoiceLanguage when a language is picked", () => {
    const setVoiceLanguage = vi.fn();

    render(
      <VoiceSettings {...realtimeProps} setVoiceLanguage={setVoiceLanguage} />,
    );

    fireEvent.change(screen.getByTestId("voice-language-select"), {
      target: { value: "es" },
    });

    expect(setVoiceLanguage).toHaveBeenCalledWith("es");
  });

  it("tucks the volume, speed, and turn detection inside the disclosure", () => {
    render(<VoiceSettings {...realtimeProps} />);

    expect(
      screen.getByTestId("voice-volume-slider").closest("details"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("voice-speed-slider").closest("details"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("turn-detection-mode").closest("details"),
    ).not.toBeNull();
  });

  it("shows Gemini VAD controls, not OpenAI speed/turn detection, for a Gemini realtime model", () => {
    render(
      <VoiceSettings
        {...realtimeProps}
        provider="gemini"
        model={GEMINI_REALTIME_MODEL}
        realtimeVoice="Puck"
      />,
    );

    expect(screen.getByTestId("gemini-start-sensitivity")).toBeTruthy();
    expect(screen.getByTestId("gemini-barge-in")).toBeTruthy();
    expect(screen.queryByTestId("voice-speed-slider")).toBeNull();
    expect(screen.queryByTestId("turn-detection-mode")).toBeNull();
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import {
  type RenderResult,
  render,
  screen,
  fireEvent,
} from "@testing-library/preact";
import { type Mock, describe, expect, it, vi } from "vitest";
import {
  type ThinkingSettingsProps,
  ThinkingSettings,
} from "#webui/components/settings/controls/ThinkingSettings";

type RenderProps = Partial<ThinkingSettingsProps> & {
  setThinking?: Mock;
  resetToDefaults?: Mock;
};

function renderThinkingSettings(
  props: RenderProps = {},
): RenderResult & { setThinking: Mock; resetToDefaults: Mock } {
  const setThinking = props.setThinking ?? vi.fn();
  const resetToDefaults = props.resetToDefaults ?? vi.fn();
  const result = render(
    <ThinkingSettings
      provider={props.provider ?? "gemini"}
      model={props.model ?? "gemini-2.5-flash"}
      thinking={props.thinking ?? "Default"}
      setThinking={setThinking}
      resetToDefaults={resetToDefaults}
    />,
  );

  return { ...result, setThinking, resetToDefaults };
}

function expectAllThinkingOptions(): void {
  expect(screen.getByRole("option", { name: "Default" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Off" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Minimal" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Low" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Medium" })).toBeDefined();
  expect(screen.getByRole("option", { name: "High" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Ultra" })).toBeDefined();
}

describe("ThinkingSettings", () => {
  describe("Gemini provider", () => {
    it("renders with correct selected thinking value", () => {
      renderThinkingSettings();
      expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
        "Default",
      );
    });

    it("displays all thinking options", () => {
      renderThinkingSettings();
      expectAllThinkingOptions();
    });
  });

  describe("OpenAI provider", () => {
    it("renders all thinking options (unified with other providers)", () => {
      renderThinkingSettings({
        provider: "openai",
        model: "gpt-5-2025-08-07",
        thinking: "Low",
      });
      expectAllThinkingOptions();
    });
  });

  describe("Ollama provider", () => {
    it("renders all thinking options", () => {
      renderThinkingSettings({
        provider: "ollama",
        model: "qwen3.5",
        thinking: "Off",
      });
      expectAllThinkingOptions();
    });
  });

  describe("LM Studio provider", () => {
    it("renders all thinking options", () => {
      renderThinkingSettings({
        provider: "lmstudio",
        model: "gpt-oss",
        thinking: "Off",
      });
      expectAllThinkingOptions();
    });
  });

  describe("Anthropic provider", () => {
    it("renders all thinking options", () => {
      renderThinkingSettings({
        provider: "anthropic",
        model: "claude-sonnet-4-6-20250514",
        thinking: "High",
      });
      expectAllThinkingOptions();
    });
  });

  describe("non-supported providers", () => {
    it("renders nothing for mistral provider", () => {
      const { container } = renderThinkingSettings({
        provider: "mistral",
        model: "mistral-large-latest",
        thinking: "Low",
      });

      expect(container.textContent).toBe("");
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  describe("OpenRouter provider", () => {
    it("renders all unified thinking options", () => {
      renderThinkingSettings({
        provider: "openrouter",
        model: "anthropic/claude-sonnet",
        thinking: "Low",
      });
      expectAllThinkingOptions();
    });
  });

  describe("common behavior", () => {
    it("triggers setThinking callback on select change", () => {
      const { setThinking } = renderThinkingSettings();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "High" },
      });
      expect(setThinking).toHaveBeenCalledExactlyOnceWith("High");
    });

    it("renders reset to defaults button", () => {
      renderThinkingSettings();
      const resetButton = screen.getByRole("button", {
        name: "Reset to defaults",
      });

      expect(resetButton).toBeDefined();
    });

    it("triggers resetToDefaults callback when reset button clicked", () => {
      const { resetToDefaults } = renderThinkingSettings();

      fireEvent.click(
        screen.getByRole("button", { name: "Reset to defaults" }),
      );
      expect(resetToDefaults).toHaveBeenCalledOnce();
    });
  });
});

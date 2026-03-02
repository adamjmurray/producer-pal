// Producer Pal
// Copyright (C) 2026 Adam Murray
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
} from "./ThinkingSettings";

type RenderProps = Partial<ThinkingSettingsProps> & {
  setThinking?: Mock;
  setShowThoughts?: Mock;
};

function renderThinkingSettings(
  props: RenderProps = {},
): RenderResult & { setThinking: Mock; setShowThoughts: Mock } {
  const setThinking = props.setThinking ?? vi.fn();
  const setShowThoughts = props.setShowThoughts ?? vi.fn();
  const result = render(
    <ThinkingSettings
      provider={props.provider ?? "gemini"}
      model={props.model ?? "gemini-2.5-flash"}
      thinking={props.thinking ?? "Default"}
      setThinking={setThinking}
      showThoughts={props.showThoughts ?? true}
      setShowThoughts={setShowThoughts}
    />,
  );

  return { ...result, setThinking, setShowThoughts };
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

function expectCheckboxVisible(): void {
  expect(screen.getByRole("checkbox")).toBeDefined();
  expect(screen.getByText("Show thinking process")).toBeDefined();
}

function expectCheckboxHidden(): void {
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText("Show thinking process")).toBeNull();
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

    it("shows checkbox when thinking is not Off", () => {
      renderThinkingSettings();
      expectCheckboxVisible();
    });

    it("hides checkbox when thinking is Off", () => {
      renderThinkingSettings({ thinking: "Off" });
      expectCheckboxHidden();
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

    it("shows checkbox when thinking is not Off", () => {
      renderThinkingSettings({
        provider: "openai",
        model: "gpt-5-2025-08-07",
        thinking: "Low",
      });
      expectCheckboxVisible();
    });

    it("hides checkbox when thinking is Off", () => {
      renderThinkingSettings({
        provider: "openai",
        model: "gpt-5-2025-08-07",
        thinking: "Off",
      });
      expectCheckboxHidden();
    });
  });

  describe("Ollama provider", () => {
    it("renders all thinking options", () => {
      renderThinkingSettings({
        provider: "ollama",
        model: "qwen3",
        thinking: "Off",
      });
      expectAllThinkingOptions();
    });

    it("does not show checkbox for Ollama provider", () => {
      renderThinkingSettings({
        provider: "ollama",
        model: "qwen3",
        thinking: "Low",
      });
      expectCheckboxHidden();
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

    it("does not show checkbox for LM Studio provider", () => {
      renderThinkingSettings({
        provider: "lmstudio",
        model: "gpt-oss",
        thinking: "Low",
      });
      expectCheckboxHidden();
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

    it("shows checkbox when thinking is not Off", () => {
      renderThinkingSettings({
        provider: "openrouter",
        model: "anthropic/claude-sonnet",
        thinking: "Low",
      });
      expectCheckboxVisible();
    });

    it("hides checkbox when thinking is Off", () => {
      renderThinkingSettings({
        provider: "openrouter",
        model: "anthropic/claude-sonnet",
        thinking: "Off",
      });
      expectCheckboxHidden();
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

    it("checkbox reflects showThoughts prop", () => {
      renderThinkingSettings({ showThoughts: false });
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
        false,
      );
    });

    it("checkbox is checked when showThoughts is true", () => {
      renderThinkingSettings({ showThoughts: true });
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
        true,
      );
    });

    it("triggers setShowThoughts callback on checkbox change", () => {
      const { setShowThoughts } = renderThinkingSettings({
        showThoughts: false,
      });

      fireEvent.click(screen.getByRole("checkbox"));
      expect(setShowThoughts).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("calls setShowThoughts with false when unchecking", () => {
      const { setShowThoughts } = renderThinkingSettings({
        showThoughts: true,
      });

      fireEvent.click(screen.getByRole("checkbox"));
      expect(setShowThoughts).toHaveBeenCalledExactlyOnceWith(false);
    });
  });
});

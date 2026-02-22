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
import { type ModelSelectorProps, ModelSelector } from "./ModelSelector";

type RenderProps = Partial<ModelSelectorProps> & { setModel?: Mock };

function renderModelSelector(
  props: RenderProps = {},
): RenderResult & { setModel: Mock } {
  const setModel = props.setModel ?? vi.fn();
  const result = render(
    <ModelSelector
      provider={props.provider ?? "gemini"}
      model={props.model ?? "gemini-2.5-flash"}
      setModel={setModel}
    />,
  );

  return { ...result, setModel };
}

function expectModelSelected(value: string, setModel: Mock): void {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  expect(setModel).toHaveBeenCalledWith(value);
}

describe("ModelSelector", () => {
  it("renders with correct selected model", () => {
    renderModelSelector();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "gemini-2.5-flash",
    );
  });

  it("displays all model options", () => {
    renderModelSelector();
    expect(
      screen.getByRole("option", { name: /^Gemini 2\.5 Pro$/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("option", { name: /^Gemini 2\.5 Flash$/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("option", { name: /^Gemini 2\.5 Flash-Lite$/ }),
    ).toBeDefined();
  });

  it("has correct option values", () => {
    renderModelSelector();
    const options = screen.getAllByRole("option") as HTMLOptionElement[];

    expect(options[0]!.value).toBe("gemini-3-flash-preview");
    expect(options[1]!.value).toBe("gemini-3.1-pro-preview");
    expect(options[2]!.value).toBe("gemini-3-pro-preview");
    expect(options[3]!.value).toBe("gemini-2.5-pro");
    expect(options[4]!.value).toBe("gemini-2.5-flash");
    expect(options[5]!.value).toBe("gemini-2.5-flash-lite");
  });

  it("triggers setModel callback on change", () => {
    const { setModel } = renderModelSelector();

    expectModelSelected("gemini-2.5-pro", setModel);
    expect(setModel).toHaveBeenCalledExactlyOnceWith("gemini-2.5-pro");
  });

  it("can select gemini-2.5-flash-lite", () => {
    const { setModel } = renderModelSelector();

    expectModelSelected("gemini-2.5-flash-lite", setModel);
  });

  describe("OpenAI provider", () => {
    it("renders OpenAI models", () => {
      renderModelSelector({ provider: "openai", model: "gpt-5" });
      expect(screen.getByRole("option", { name: /^GPT-5\.2$/ })).toBeDefined();
      expect(screen.getByRole("option", { name: /^GPT-5$/ })).toBeDefined();
      expect(
        screen.getByRole("option", { name: /^GPT-5 Mini$/ }),
      ).toBeDefined();
    });

    it("calls setModel when OpenAI model changes", () => {
      const { setModel } = renderModelSelector({
        provider: "openai",
        model: "gpt-5",
      });

      expectModelSelected("gpt-5-mini", setModel);
    });
  });

  describe("Mistral provider", () => {
    it("renders Mistral models", () => {
      renderModelSelector({
        provider: "mistral",
        model: "mistral-large-latest",
      });
      expect(
        screen.getByRole("option", { name: /Mistral Large/ }),
      ).toBeDefined();
      expect(
        screen.getByRole("option", { name: /Mistral Medium/ }),
      ).toBeDefined();
    });

    it("calls setModel when Mistral model changes", () => {
      const { setModel } = renderModelSelector({
        provider: "mistral",
        model: "mistral-large-latest",
      });

      expectModelSelected("mistral-small-latest", setModel);
    });
  });

  describe("OpenRouter provider", () => {
    it("renders OpenRouter models", () => {
      renderModelSelector({
        provider: "openrouter",
        model: "qwen/qwen3-coder:free",
      });
      expect(
        screen.getByRole("option", { name: /\[Free] Qwen3 Coder/ }),
      ).toBeDefined();
      expect(
        screen.getByRole("option", { name: /\[Free] Z\.AI GLM/ }),
      ).toBeDefined();
    });

    it("calls setModel when OpenRouter model changes", () => {
      const { setModel } = renderModelSelector({
        provider: "openrouter",
        model: "qwen/qwen3-coder:free",
      });

      expectModelSelected("z-ai/glm-4.5-air:free", setModel);
    });
  });

  describe("custom provider", () => {
    it("renders text input for custom provider", () => {
      renderModelSelector({ provider: "custom", model: "gpt-4" });
      const input = screen.getByPlaceholderText(/e.g., openai\/gpt-oss/);

      expect(input).toBeDefined();
      expect((input as HTMLInputElement).type).toBe("text");
    });

    it("calls setModel when custom input changes", () => {
      const { setModel } = renderModelSelector({
        provider: "custom",
        model: "gpt-4",
      });

      fireEvent.change(screen.getByPlaceholderText(/e.g., openai\/gpt-oss/), {
        target: { value: "claude-3-opus" },
      });
      expect(setModel).toHaveBeenCalledWith("claude-3-opus");
    });
  });

  describe("lmstudio provider", () => {
    it("renders text input for lmstudio provider", () => {
      renderModelSelector({ provider: "lmstudio", model: "llama-3.1-70b" });
      expect(
        screen.getByPlaceholderText(/e.g., qwen\/qwen3-coder/),
      ).toBeDefined();
    });

    it("calls setModel when lmstudio input changes", () => {
      const { setModel } = renderModelSelector({
        provider: "lmstudio",
        model: "llama-3.1-70b",
      });

      fireEvent.change(screen.getByPlaceholderText(/e.g., qwen\/qwen3-coder/), {
        target: { value: "qwen-2.5-72b" },
      });
      expect(setModel).toHaveBeenCalledWith("qwen-2.5-72b");
    });
  });

  describe("ollama provider", () => {
    it("renders Ollama models", () => {
      renderModelSelector({ provider: "ollama", model: "ministral-3" });
      expect(screen.getByRole("option", { name: /Ministral 3/ })).toBeDefined();
      expect(screen.getByRole("option", { name: /Qwen3 Coder/ })).toBeDefined();
    });

    it("calls setModel when Ollama model changes", () => {
      const { setModel } = renderModelSelector({
        provider: "ollama",
        model: "ministral-3",
      });

      expectModelSelected("qwen3", setModel);
    });
  });

  describe("Other... functionality", () => {
    it("shows custom input when Other is selected", () => {
      renderModelSelector();
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "OTHER" },
      });
      expect(
        screen.getByPlaceholderText(/e.g., gemini-2.0-flash/),
      ).toBeDefined();
    });

    it("allows editing custom model in text input", () => {
      const { setModel } = renderModelSelector();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "OTHER" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e.g., gemini-2.0-flash/), {
        target: { value: "custom-model-name" },
      });
      expect(setModel).toHaveBeenCalledWith("custom-model-name");
    });

    it("shows custom input initially for non-preset models", () => {
      renderModelSelector({ model: "my-custom-model" });
      expect(
        screen.getByPlaceholderText(/e.g., gemini-2.0-flash/),
      ).toBeDefined();
      expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
        "OTHER",
      );
    });

    it("shows provider-specific placeholders for OpenAI", () => {
      renderModelSelector({ provider: "openai", model: "my-custom-openai" });
      expect(screen.getByPlaceholderText(/e.g., gpt-5-nano/)).toBeDefined();
    });

    it("shows provider-specific placeholders for Mistral", () => {
      renderModelSelector({ provider: "mistral", model: "my-custom-mistral" });
      expect(
        screen.getByPlaceholderText(/e.g., ministral-14b-latest/),
      ).toBeDefined();
    });

    it("shows provider-specific placeholders for OpenRouter", () => {
      renderModelSelector({
        provider: "openrouter",
        model: "my-custom-openrouter",
      });
      expect(
        screen.getByPlaceholderText(/e.g., bytedance-seed\/seed-1.6/),
      ).toBeDefined();
    });

    it("shows provider-specific placeholders for Ollama", () => {
      renderModelSelector({ provider: "ollama", model: "my-custom-ollama" });
      expect(screen.getByPlaceholderText(/e.g., qwen3:30b/)).toBeDefined();
    });
  });
});

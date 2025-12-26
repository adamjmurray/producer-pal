/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ModelSelector } from "./ModelSelector";

describe("ModelSelector", () => {
  it("renders with correct selected model", () => {
    const setModel = vi.fn();
    render(
      <ModelSelector
        provider="gemini"
        model="gemini-2.5-flash"
        setModel={setModel}
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("gemini-2.5-flash");
  });

  it("displays all model options", () => {
    const setModel = vi.fn();
    render(
      <ModelSelector
        provider="gemini"
        model="gemini-2.5-flash"
        setModel={setModel}
      />,
    );

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
    const setModel = vi.fn();
    render(
      <ModelSelector
        provider="gemini"
        model="gemini-2.5-flash"
        setModel={setModel}
      />,
    );

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options[0]!.value).toBe("gemini-2.5-flash");
    expect(options[1]!.value).toBe("gemini-3-pro-preview");
    expect(options[2]!.value).toBe("gemini-3-flash-preview");
    expect(options[3]!.value).toBe("gemini-2.5-pro");
    expect(options[4]!.value).toBe("gemini-2.5-flash-lite");
  });

  it("triggers setModel callback on change", () => {
    const setModel = vi.fn();
    render(
      <ModelSelector
        provider="gemini"
        model="gemini-2.5-flash"
        setModel={setModel}
      />,
    );

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "gemini-2.5-pro" } });

    expect(setModel).toHaveBeenCalledOnce();
    expect(setModel).toHaveBeenCalledWith("gemini-2.5-pro");
  });

  it("can select gemini-2.5-flash-lite", () => {
    const setModel = vi.fn();
    render(
      <ModelSelector
        provider="gemini"
        model="gemini-2.5-flash"
        setModel={setModel}
      />,
    );

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "gemini-2.5-flash-lite" } });

    expect(setModel).toHaveBeenCalledWith("gemini-2.5-flash-lite");
  });

  describe("OpenAI provider", () => {
    it("renders OpenAI models", () => {
      render(
        <ModelSelector
          provider="openai"
          model="gpt-5-2025-08-07"
          setModel={vi.fn()}
        />,
      );
      expect(screen.getByRole("option", { name: /^GPT-5\.2$/ })).toBeDefined();
      expect(screen.getByRole("option", { name: /^GPT-5$/ })).toBeDefined();
      expect(
        screen.getByRole("option", { name: /^GPT-5 Mini$/ }),
      ).toBeDefined();
    });

    it("calls setModel when OpenAI model changes", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="openai"
          model="gpt-5-2025-08-07"
          setModel={setModel}
        />,
      );
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "gpt-5-mini-2025-08-07" } });
      expect(setModel).toHaveBeenCalledWith("gpt-5-mini-2025-08-07");
    });
  });

  describe("Mistral provider", () => {
    it("renders Mistral models", () => {
      render(
        <ModelSelector
          provider="mistral"
          model="mistral-large-latest"
          setModel={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("option", { name: /Mistral Large/ }),
      ).toBeDefined();
      expect(
        screen.getByRole("option", { name: /Mistral Medium/ }),
      ).toBeDefined();
    });

    it("calls setModel when Mistral model changes", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="mistral"
          model="mistral-large-latest"
          setModel={setModel}
        />,
      );
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "mistral-small-latest" } });
      expect(setModel).toHaveBeenCalledWith("mistral-small-latest");
    });
  });

  describe("OpenRouter provider", () => {
    it("renders OpenRouter models", () => {
      render(
        <ModelSelector
          provider="openrouter"
          model="qwen/qwen3-coder:free"
          setModel={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("option", { name: /\[Free\] Qwen3 Coder/ }),
      ).toBeDefined();
      expect(
        screen.getByRole("option", { name: /\[Free\] Z\.AI GLM/ }),
      ).toBeDefined();
    });

    it("calls setModel when OpenRouter model changes", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="openrouter"
          model="qwen/qwen3-coder:free"
          setModel={setModel}
        />,
      );
      const select = screen.getByRole("combobox");
      fireEvent.change(select, {
        target: { value: "mistralai/devstral-2512:free" },
      });
      expect(setModel).toHaveBeenCalledWith("mistralai/devstral-2512:free");
    });
  });

  describe("custom provider", () => {
    it("renders text input for custom provider", () => {
      render(
        <ModelSelector provider="custom" model="gpt-4" setModel={vi.fn()} />,
      );
      const input = screen.getByPlaceholderText(/e.g., gpt-4/);
      expect(input).toBeDefined();
      expect((input as HTMLInputElement).type).toBe("text");
    });

    it("calls setModel when custom input changes", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector provider="custom" model="gpt-4" setModel={setModel} />,
      );
      const input = screen.getByPlaceholderText(/e.g., gpt-4/);
      fireEvent.change(input, { target: { value: "claude-3-opus" } });
      expect(setModel).toHaveBeenCalledWith("claude-3-opus");
    });
  });

  describe("lmstudio provider", () => {
    it("renders text input for lmstudio provider", () => {
      render(
        <ModelSelector
          provider="lmstudio"
          model="llama-3.1-70b"
          setModel={vi.fn()}
        />,
      );
      const input = screen.getByPlaceholderText(/e.g., llama-3.1-70b/);
      expect(input).toBeDefined();
    });

    it("calls setModel when lmstudio input changes", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="lmstudio"
          model="llama-3.1-70b"
          setModel={setModel}
        />,
      );
      const input = screen.getByPlaceholderText(/e.g., llama-3.1-70b/);
      fireEvent.change(input, { target: { value: "qwen-2.5-72b" } });
      expect(setModel).toHaveBeenCalledWith("qwen-2.5-72b");
    });
  });

  describe("ollama provider", () => {
    it("renders Ollama models", () => {
      render(
        <ModelSelector
          provider="ollama"
          model="ministral-3"
          setModel={vi.fn()}
        />,
      );
      expect(screen.getByRole("option", { name: /Ministral 3/ })).toBeDefined();
      expect(screen.getByRole("option", { name: /Qwen3 Coder/ })).toBeDefined();
    });

    it("calls setModel when Ollama model changes", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="ollama"
          model="ministral-3"
          setModel={setModel}
        />,
      );
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "qwen3" } });
      expect(setModel).toHaveBeenCalledWith("qwen3");
    });
  });

  describe("Other... functionality", () => {
    it("shows custom input when Other is selected", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="gemini"
          model="gemini-2.5-flash"
          setModel={setModel}
        />,
      );
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "OTHER" } });

      // Custom input should now appear
      const customInput = screen.getByPlaceholderText(/e.g., gpt-4, claude/);
      expect(customInput).toBeDefined();
    });

    it("allows editing custom model in text input", () => {
      const setModel = vi.fn();
      render(
        <ModelSelector
          provider="gemini"
          model="gemini-2.5-flash"
          setModel={setModel}
        />,
      );
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "OTHER" } });

      const customInput = screen.getByPlaceholderText(/e.g., gpt-4, claude/);
      fireEvent.change(customInput, { target: { value: "custom-model-name" } });
      expect(setModel).toHaveBeenCalledWith("custom-model-name");
    });

    it("shows custom input initially for non-preset models", () => {
      render(
        <ModelSelector
          provider="gemini"
          model="my-custom-model"
          setModel={vi.fn()}
        />,
      );

      // Custom input should be visible initially
      const customInput = screen.getByPlaceholderText(/e.g., gpt-4, claude/);
      expect(customInput).toBeDefined();

      // Dropdown should show "OTHER"
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("OTHER");
    });
  });
});

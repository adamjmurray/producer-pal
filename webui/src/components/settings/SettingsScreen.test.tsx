/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { SettingsScreen } from "./SettingsScreen.jsx";

// Mock child components
vi.mock("./ModelSelector.jsx", () => ({
  ModelSelector: ({ model }: { model: string }) => (
    <div data-testid="model-selector">{model}</div>
  ),
}));

vi.mock("./ThinkingSettings.jsx", () => ({
  ThinkingSettings: ({
    provider,
    model,
    thinking,
  }: {
    provider: string;
    model: string;
    thinking: string;
  }) => (
    <div data-testid="thinking-settings">
      {provider}-{model}-{thinking}
    </div>
  ),
}));

vi.mock("./RandomnessSlider.jsx", () => ({
  RandomnessSlider: ({ temperature }: { temperature: number }) => (
    <div data-testid="randomness-slider">{temperature}</div>
  ),
}));

describe("SettingsScreen", () => {
  const defaultProps = {
    provider: "gemini" as const,
    setProvider: vi.fn(),
    apiKey: "",
    setApiKey: vi.fn(),
    model: "gemini-2.5-pro",
    setModel: vi.fn(),
    thinking: "Medium",
    setThinking: vi.fn(),
    temperature: 1.0,
    setTemperature: vi.fn(),
    showThoughts: false,
    setShowThoughts: vi.fn(),
    theme: "system",
    setTheme: vi.fn(),
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    hasApiKey: false,
    settingsConfigured: false,
    clearConversation: vi.fn(),
    messageCount: 0,
    activeModel: null,
  };

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByText("Producer Pal Chat Settings")).toBeDefined();
    });

    it("renders all child components for Gemini", () => {
      render(<SettingsScreen {...defaultProps} />);

      // Check for API key input (no longer uses GeminiApiKeyInput)
      expect(
        screen.getByPlaceholderText(/Enter your Gemini API key/i),
      ).toBeDefined();
      expect(screen.getByTestId("model-selector")).toBeDefined();
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
      expect(screen.getByTestId("randomness-slider")).toBeDefined();
    });

    it("renders Save button", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    });
  });

  describe("theme selector", () => {
    it("renders Appearance label", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByText("Appearance")).toBeDefined();
    });

    it("renders theme selector with options", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("option", { name: "System" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Light" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Dark" })).toBeDefined();
    });

    it("has correct initial value", () => {
      render(<SettingsScreen {...defaultProps} theme="dark" />);
      const select = screen.getByLabelText("Appearance") as HTMLSelectElement;
      expect(select.value).toBe("dark");
    });

    it("calls setTheme when changed", () => {
      const setTheme = vi.fn();
      render(<SettingsScreen {...defaultProps} setTheme={setTheme} />);

      const select = screen.getByLabelText("Appearance");
      fireEvent.change(select, { target: { value: "light" } });

      expect(setTheme).toHaveBeenCalledOnce();
      expect(setTheme).toHaveBeenCalledWith("light");
    });
  });

  describe("thinking settings visibility", () => {
    it("shows thinking settings for Gemini", () => {
      render(<SettingsScreen {...defaultProps} provider="gemini" />);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });

    it("shows thinking settings for OpenAI", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="openai"
          model="gpt-5-2025-08-07"
        />,
      );
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });

    it("shows thinking settings for Mistral", () => {
      render(<SettingsScreen {...defaultProps} provider="mistral" />);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });

    it("shows thinking settings for Custom provider", () => {
      render(<SettingsScreen {...defaultProps} provider="custom" />);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });
  });

  describe("conditional note text", () => {
    it("shows browser storage message when settings not configured", () => {
      render(<SettingsScreen {...defaultProps} settingsConfigured={false} />);
      expect(
        screen.getByText("Settings will be stored in this web browser."),
      ).toBeDefined();
    });

    it("shows new conversation message when settings configured", () => {
      render(<SettingsScreen {...defaultProps} settingsConfigured={true} />);
      expect(
        screen.getByText("Note: Settings changes apply to new conversations."),
      ).toBeDefined();
    });
  });

  describe("Cancel button", () => {
    it("is not shown when settings not configured", () => {
      render(<SettingsScreen {...defaultProps} settingsConfigured={false} />);
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    it("is shown when settings configured", () => {
      render(<SettingsScreen {...defaultProps} settingsConfigured={true} />);
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    });

    it("calls cancelSettings when clicked", () => {
      const cancelSettings = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          settingsConfigured={true}
          cancelSettings={cancelSettings}
        />,
      );

      const button = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(button);

      expect(cancelSettings).toHaveBeenCalledOnce();
    });
  });

  describe("Save button", () => {
    it("is enabled even when no API key", () => {
      render(<SettingsScreen {...defaultProps} apiKey="" />);

      const button = screen.getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("is enabled when API key is provided", () => {
      render(<SettingsScreen {...defaultProps} apiKey="test-key" />);

      const button = screen.getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("calls saveSettings when clicked with empty API key", () => {
      const saveSettings = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          apiKey=""
          saveSettings={saveSettings}
        />,
      );

      const button = screen.getByRole("button", { name: "Save" });
      fireEvent.click(button);

      expect(saveSettings).toHaveBeenCalledOnce();
    });

    it("calls saveSettings when clicked with API key", () => {
      const saveSettings = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          apiKey="test-key"
          saveSettings={saveSettings}
        />,
      );

      const button = screen.getByRole("button", { name: "Save" });
      fireEvent.click(button);

      expect(saveSettings).toHaveBeenCalledOnce();
    });
  });

  describe("Clear Conversation button", () => {
    it("is not shown when no messages and no active model", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          messageCount={0}
          activeModel={null}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Clear & Restart Conversation" }),
      ).toBeNull();
    });

    it("is shown when messageCount > 0", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          messageCount={5}
          activeModel={null}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Clear & Restart Conversation" }),
      ).toBeDefined();
    });

    it("is shown when activeModel is set", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          messageCount={0}
          activeModel="gemini-2.5-pro"
        />,
      );

      expect(
        screen.getByRole("button", { name: "Clear & Restart Conversation" }),
      ).toBeDefined();
    });

    it("is shown when both messageCount and activeModel are set", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          messageCount={3}
          activeModel="gemini-2.5-pro"
        />,
      );

      expect(
        screen.getByRole("button", { name: "Clear & Restart Conversation" }),
      ).toBeDefined();
    });

    it("calls clearConversation when clicked", () => {
      const clearConversation = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          messageCount={1}
          clearConversation={clearConversation}
        />,
      );

      const button = screen.getByRole("button", {
        name: "Clear & Restart Conversation",
      });
      fireEvent.click(button);

      expect(clearConversation).toHaveBeenCalledOnce();
    });
  });

  describe("props passing to child components", () => {
    it("passes correct props to child components", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          apiKey="my-key"
          model="gemini-2.5-flash"
          thinking="High"
          temperature={1.5}
        />,
      );

      // API key input now uses password input (no longer GeminiApiKeyInput component)
      const apiKeyInput = screen.getByPlaceholderText(
        /Enter your Gemini API key/i,
      ) as HTMLInputElement;
      expect(apiKeyInput.value).toBe("my-key");
      expect(apiKeyInput.type).toBe("password");

      expect(screen.getByTestId("model-selector").textContent).toBe(
        "gemini-2.5-flash",
      );
      // ThinkingSettings now receives provider-model-thinking
      expect(screen.getByTestId("thinking-settings").textContent).toBe(
        "gemini-gemini-2.5-flash-High",
      );
      expect(screen.getByTestId("randomness-slider").textContent).toBe("1.5");
    });
  });

  describe("API key links", () => {
    it("shows Gemini API key link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="gemini" />);
      const link = screen.getByText("Gemini API keys");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://aistudio.google.com/apikey",
      );
      expect((link as HTMLAnchorElement).target).toBe("_blank");
    });

    it("shows OpenAI API key link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="openai" />);
      const link = screen.getByText("OpenAI API keys");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://platform.openai.com/api-keys",
      );
    });

    it("shows Mistral API key link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="mistral" />);
      const link = screen.getByText("Mistral API keys");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://console.mistral.ai/home?workspace_dialog=apiKeys",
      );
    });

    it("shows OpenRouter API key link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="openrouter" />);
      const link = screen.getByText("OpenRouter API keys");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://openrouter.ai/settings/keys",
      );
    });

    it("does not show API key link for LM Studio", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="lmstudio"
          port={1234}
          setPort={vi.fn()}
        />,
      );
      expect(screen.queryByText(/Get a.*API key/)).toBeNull();
    });

    it("does not show API key link for Ollama", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="ollama"
          port={11434}
          setPort={vi.fn()}
        />,
      );
      expect(screen.queryByText(/Get a.*API key/)).toBeNull();
    });

    it("does not show API key link for custom provider", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="custom"
          baseUrl="https://api.example.com/v1"
          setBaseUrl={vi.fn()}
        />,
      );
      expect(screen.queryByText(/Get a.*API key/)).toBeNull();
    });
  });

  describe("Model documentation links", () => {
    it("shows Gemini models link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="gemini" />);
      const link = screen.getByText("Gemini models");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://ai.google.dev/gemini-api/docs/models",
      );
      expect((link as HTMLAnchorElement).target).toBe("_blank");
    });

    it("shows OpenAI models link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="openai" />);
      const link = screen.getByText("OpenAI models");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://platform.openai.com/docs/models",
      );
    });

    it("shows Mistral models link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="mistral" />);
      const link = screen.getByText("Mistral models");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://docs.mistral.ai/getting-started/models",
      );
    });

    it("shows OpenRouter models link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} provider="openrouter" />);
      const link = screen.getByText("OpenRouter models");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://openrouter.ai/models",
      );
    });

    it("shows LM Studio models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="lmstudio"
          port={1234}
          setPort={vi.fn()}
        />,
      );
      const link = screen.getByText("LM Studio models");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://lmstudio.ai/models",
      );
    });

    it("shows Ollama models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="ollama"
          port={11434}
          setPort={vi.fn()}
        />,
      );
      const link = screen.getByText("Ollama models");
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://ollama.com/search",
      );
    });

    it("does not show models link for custom provider", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="custom"
          baseUrl="https://api.example.com/v1"
          setBaseUrl={vi.fn()}
        />,
      );
      expect(screen.queryByText(/models$/)).toBeNull();
    });
  });
});

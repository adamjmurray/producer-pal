/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "./SettingsScreen";

// Mock child components
vi.mock(import("./ConnectionTab"), () => ({
  ConnectionTab: ({ model }: { model: string }) => (
    <div>
      <div data-testid="model-selector">{model}</div>
    </div>
  ),
}));

vi.mock(import("./controls/ThinkingSettings"), () => ({
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

vi.mock(import("./controls/RandomnessSlider"), () => ({
  RandomnessSlider: ({ temperature }: { temperature: number }) => (
    <div data-testid="randomness-slider">{temperature}</div>
  ),
}));

vi.mock(import("./controls/ToolToggles"), () => ({
  ToolToggles: () => <div data-testid="tool-toggles">Tool Toggles</div>,
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
    enabledTools: {},
    setEnabledTools: vi.fn(),
    enableAllTools: vi.fn(),
    disableAllTools: vi.fn(),
    resetBehaviorToDefaults: vi.fn(),
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    settingsConfigured: false,
  };

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByText("Producer Pal Chat Settings")).toBeDefined();
    });

    it("renders all child components for Gemini", () => {
      render(<SettingsScreen {...defaultProps} />);

      // Connection tab is active by default
      expect(
        screen.getByPlaceholderText(/Enter your Gemini API key/i),
      ).toBeDefined();
      expect(screen.getByTestId("model-selector")).toBeDefined();

      // Switch to Behavior tab to check thinking and randomness
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
      expect(screen.getByTestId("randomness-slider")).toBeDefined();

      // Switch to Tools tab to check tool toggles
      const toolsTab = screen.getByRole("button", { name: "Tools" });
      fireEvent.click(toolsTab);
      expect(screen.getByTestId("tool-toggles")).toBeDefined();
    });

    it("renders Save button", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    });
  });

  describe("theme selector", () => {
    it("renders Appearance label", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Appearance" })).toBeDefined();
    });

    it("renders theme selector with options", () => {
      render(<SettingsScreen {...defaultProps} />);
      // Click on Appearance tab
      const appearanceTab = screen.getByRole("button", { name: "Appearance" });
      fireEvent.click(appearanceTab);
      expect(screen.getByRole("option", { name: "System" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Light" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Dark" })).toBeDefined();
    });

    it("has correct initial value", () => {
      render(<SettingsScreen {...defaultProps} theme="dark" />);
      // Click on Appearance tab
      const appearanceTab = screen.getByRole("button", { name: "Appearance" });
      fireEvent.click(appearanceTab);
      const select = screen.getByLabelText("Theme") as HTMLSelectElement;
      expect(select.value).toBe("dark");
    });

    it("calls setTheme when changed", () => {
      const setTheme = vi.fn();
      render(<SettingsScreen {...defaultProps} setTheme={setTheme} />);

      // Click on Appearance tab
      const appearanceTab = screen.getByRole("button", { name: "Appearance" });
      fireEvent.click(appearanceTab);
      const select = screen.getByLabelText("Theme");
      fireEvent.change(select, { target: { value: "light" } });

      expect(setTheme).toHaveBeenCalledOnce();
      expect(setTheme).toHaveBeenCalledWith("light");
    });
  });

  describe("thinking settings visibility", () => {
    it("shows thinking settings for Gemini", () => {
      render(<SettingsScreen {...defaultProps} provider="gemini" />);
      // Click on Behavior tab
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
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
      // Click on Behavior tab
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });

    it("shows thinking settings for Mistral", () => {
      render(<SettingsScreen {...defaultProps} provider="mistral" />);
      // Click on Behavior tab
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });

    it("shows thinking settings for Custom provider", () => {
      render(<SettingsScreen {...defaultProps} provider="custom" />);
      // Click on Behavior tab
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
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

      // Connection tab is active by default
      // API key input now uses password input (no longer GeminiApiKeyInput component)
      const apiKeyInput = screen.getByPlaceholderText(
        /Enter your Gemini API key/i,
      ) as HTMLInputElement;
      expect(apiKeyInput.value).toBe("my-key");
      expect(apiKeyInput.type).toBe("password");

      expect(screen.getByTestId("model-selector").textContent).toBe(
        "gemini-2.5-flash",
      );

      // Click on Behavior tab to check thinking and randomness
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
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

  describe("input handlers", () => {
    it("calls setApiKey when API key input changes", () => {
      const setApiKey = vi.fn();
      render(<SettingsScreen {...defaultProps} setApiKey={setApiKey} />);
      const input = screen.getByPlaceholderText(/Enter your Gemini API key/i);
      fireEvent.change(input, { target: { value: "new-api-key" } });
      expect(setApiKey).toHaveBeenCalledWith("new-api-key");
    });

    it("calls setPort when port input changes for lmstudio", () => {
      const setPort = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          provider="lmstudio"
          port={1234}
          setPort={setPort}
        />,
      );
      const input = screen.getByPlaceholderText("1234");
      fireEvent.change(input, { target: { value: "5678" } });
      expect(setPort).toHaveBeenCalledWith(5678);
    });

    it("calls setPort when port input changes for ollama", () => {
      const setPort = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          provider="ollama"
          port={11434}
          setPort={setPort}
        />,
      );
      const input = screen.getByPlaceholderText("11434");
      fireEvent.change(input, { target: { value: "8080" } });
      expect(setPort).toHaveBeenCalledWith(8080);
    });

    it("calls setBaseUrl when base URL input changes for custom provider", () => {
      const setBaseUrl = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          provider="custom"
          baseUrl=""
          setBaseUrl={setBaseUrl}
        />,
      );
      const input = screen.getByPlaceholderText("https://api.example.com/v1");
      fireEvent.change(input, { target: { value: "https://custom.api/v1" } });
      expect(setBaseUrl).toHaveBeenCalledWith("https://custom.api/v1");
    });
  });

  describe("reset behavior button", () => {
    it("calls resetBehaviorToDefaults when clicked", () => {
      const resetBehaviorToDefaults = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          resetBehaviorToDefaults={resetBehaviorToDefaults}
        />,
      );
      // Click on Behavior tab
      const behaviorTab = screen.getByRole("button", { name: "Behavior" });
      fireEvent.click(behaviorTab);
      const resetButton = screen.getByRole("button", {
        name: "Reset to defaults",
      });
      fireEvent.click(resetButton);
      expect(resetBehaviorToDefaults).toHaveBeenCalledOnce();
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

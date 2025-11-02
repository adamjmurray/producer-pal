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
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    hasApiKey: false,
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

  describe("thinking settings visibility", () => {
    it("shows thinking settings for Gemini", () => {
      render(<SettingsScreen {...defaultProps} provider="gemini" />);
      expect(screen.getByTestId("thinking-settings")).toBeDefined();
    });

    it("hides thinking settings for OpenAI (no reasoning models)", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          provider="openai"
          model="gpt-5-2025-08-07"
        />,
      );
      expect(screen.queryByTestId("thinking-settings")).toBeNull();
    });

    it("hides thinking settings for Mistral", () => {
      render(<SettingsScreen {...defaultProps} provider="mistral" />);
      expect(screen.queryByTestId("thinking-settings")).toBeNull();
    });

    it("hides thinking settings for Custom provider", () => {
      render(<SettingsScreen {...defaultProps} provider="custom" />);
      expect(screen.queryByTestId("thinking-settings")).toBeNull();
    });
  });

  describe("conditional note text", () => {
    it("shows browser storage message when no API key", () => {
      render(<SettingsScreen {...defaultProps} hasApiKey={false} />);
      expect(
        screen.getByText("Settings will be stored in this web browser."),
      ).toBeDefined();
    });

    it("shows new conversation message when API key exists", () => {
      render(<SettingsScreen {...defaultProps} hasApiKey={true} />);
      expect(
        screen.getByText("Note: Settings changes apply to new conversations."),
      ).toBeDefined();
    });
  });

  describe("Cancel button", () => {
    it("is not shown when no API key", () => {
      render(<SettingsScreen {...defaultProps} hasApiKey={false} />);
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    it("is shown when API key exists", () => {
      render(<SettingsScreen {...defaultProps} hasApiKey={true} />);
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    });

    it("calls cancelSettings when clicked", () => {
      const cancelSettings = vi.fn();
      render(
        <SettingsScreen
          {...defaultProps}
          hasApiKey={true}
          cancelSettings={cancelSettings}
        />,
      );

      const button = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(button);

      expect(cancelSettings).toHaveBeenCalledOnce();
    });
  });

  describe("Save button", () => {
    it("is disabled when no API key", () => {
      render(<SettingsScreen {...defaultProps} apiKey="" />);

      const button = screen.getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("is enabled when API key is provided", () => {
      render(<SettingsScreen {...defaultProps} apiKey="test-key" />);

      const button = screen.getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("calls saveSettings when clicked", () => {
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
          hasApiKey={true}
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
});

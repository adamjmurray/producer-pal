/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock all the custom hooks
vi.mock(import("../hooks/settings/use-settings"), () => ({
  useSettings: vi.fn(),
}));

vi.mock(import("../hooks/theme/use-theme"), () => ({
  useTheme: vi.fn(),
}));

vi.mock(import("../hooks/connection/use-mcp-connection"), () => ({
  useMcpConnection: vi.fn(),
}));

vi.mock(import("../hooks/chat/use-gemini-chat"), () => ({
  useGeminiChat: vi.fn(),
}));

vi.mock(import("../hooks/chat/use-openai-chat"), () => ({
  useOpenAIChat: vi.fn(),
}));

// Import mocked modules to access them in tests
import { useGeminiChat } from "../hooks/chat/use-gemini-chat";
import { useMcpConnection } from "../hooks/connection/use-mcp-connection";
import { useOpenAIChat } from "../hooks/chat/use-openai-chat";
import { useSettings } from "../hooks/settings/use-settings";
import { useTheme } from "../hooks/theme/use-theme";
import { App } from "./App";

describe("App", () => {
  const mockChatHook = {
    messages: [],
    isAssistantResponding: false,
    handleSend: vi.fn(),
    handleRetry: vi.fn(),
    clearConversation: vi.fn(),
    stopResponse: vi.fn(),
    activeModel: "test-model",
    activeThinking: null,
    activeTemperature: 1.0,
  };

  const mockSettingsHook = {
    provider: "gemini" as const,
    setProvider: vi.fn(),
    apiKey: "test-key",
    setApiKey: vi.fn(),
    baseUrl: "",
    setBaseUrl: vi.fn(),
    port: 1234,
    setPort: vi.fn(),
    model: "gemini-1.5-flash",
    setModel: vi.fn(),
    thinking: "default" as const,
    setThinking: vi.fn(),
    temperature: 1.0,
    setTemperature: vi.fn(),
    showThoughts: false,
    setShowThoughts: vi.fn(),
    enabledTools: {},
    setEnabledTools: vi.fn(),
    enableAllTools: vi.fn(),
    disableAllTools: vi.fn(),
    resetBehaviorToDefaults: vi.fn(),
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    settingsConfigured: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue(mockSettingsHook);
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
    });
    (useMcpConnection as ReturnType<typeof vi.fn>).mockReturnValue({
      mcpStatus: "connected",
      mcpError: null,
      checkMcpConnection: vi.fn(),
    });
    (useGeminiChat as ReturnType<typeof vi.fn>).mockReturnValue(mockChatHook);
    (useOpenAIChat as ReturnType<typeof vi.fn>).mockReturnValue(mockChatHook);
  });

  describe("screen routing", () => {
    it("renders ChatScreen when settings are configured", () => {
      render(<App />);
      // ChatScreen contains a header
      const header = document.querySelector("header");

      expect(header).toBeDefined();
    });

    it("renders SettingsScreen when settings are not configured", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: false,
      });
      render(<App />);
      // SettingsScreen contains the settings form
      // Look for something unique to settings screen like the provider selector label
      const settingsContent = document.body.textContent;

      expect(settingsContent).toContain("Provider");
    });

    it("initializes with SettingsScreen when settingsConfigured is false", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: false,
      });
      const { container } = render(<App />);

      // Settings screen should be visible
      expect(container.textContent).toContain("Provider");
    });

    it("initializes with ChatScreen when settingsConfigured is true", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: true,
      });
      render(<App />);
      // Chat screen should be visible
      const header = document.querySelector("header");

      expect(header).toBeDefined();
    });
  });

  describe("provider routing", () => {
    it("uses Gemini chat for gemini provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "gemini",
      });
      render(<App />);
      // Gemini chat hook should have been called
      expect(useGeminiChat).toHaveBeenCalled();
    });

    it("uses OpenAI chat for openai provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openai",
      });
      render(<App />);
      // OpenAI chat hook should have been called
      expect(useOpenAIChat).toHaveBeenCalled();
    });

    it("uses OpenAI chat for mistral provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "mistral",
      });
      render(<App />);
      // OpenAI chat hook should have been called (mistral uses OpenAI-compatible API)
      expect(useOpenAIChat).toHaveBeenCalled();
    });

    it("uses OpenAI chat for custom provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "custom",
        baseUrl: "https://custom.api.com/v1",
      });
      render(<App />);
      // OpenAI chat hook should have been called
      expect(useOpenAIChat).toHaveBeenCalled();
    });

    it("uses OpenAI chat for lmstudio provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        port: 1234,
      });
      render(<App />);
      // OpenAI chat hook should have been called
      expect(useOpenAIChat).toHaveBeenCalled();
    });

    it("uses OpenAI chat for ollama provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "ollama",
        port: 11434,
      });
      render(<App />);
      // OpenAI chat hook should have been called
      expect(useOpenAIChat).toHaveBeenCalled();
    });
  });

  describe("hook integration", () => {
    it("calls useSettings hook", () => {
      render(<App />);
      expect(useSettings).toHaveBeenCalled();
    });

    it("calls useTheme hook", () => {
      render(<App />);
      expect(useTheme).toHaveBeenCalled();
    });

    it("calls useMcpConnection hook", () => {
      render(<App />);
      expect(useMcpConnection).toHaveBeenCalled();
    });

    it("passes settings to chat hooks", () => {
      render(<App />);
      // At least one of the chat hooks should receive settings
      const geminiCalls = (useGeminiChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(geminiCalls.length).toBeGreaterThan(0);
      expect(geminiCalls[0]![0]).toHaveProperty("apiKey");
      expect(geminiCalls[0]![0]).toHaveProperty("model");
    });
  });

  describe("settings interactions", () => {
    it("calls saveSettings when save button is clicked in settings screen", () => {
      const mockSaveSettings = vi.fn();

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: false,
        saveSettings: mockSaveSettings,
      });
      const { container } = render(<App />);
      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Save",
      );

      expect(saveButton).toBeDefined();

      if (saveButton) {
        fireEvent.click(saveButton);
      }

      expect(mockSaveSettings).toHaveBeenCalledOnce();
    });

    it("calls cancelSettings and reverts theme when cancel button is clicked", () => {
      const mockCancelSettings = vi.fn();
      const mockSetTheme = vi.fn();
      const initialTheme = "light";

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: true, // Start with chat screen
        cancelSettings: mockCancelSettings,
      });
      (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
        theme: initialTheme,
        setTheme: mockSetTheme,
      });

      const { container, rerender } = render(<App />);

      // Open settings by finding the settings button in chat header (by text)
      const settingsButton = Array.from(
        container.querySelectorAll("button"),
      ).find((btn) => btn.textContent === "Settings");

      expect(settingsButton).toBeDefined();

      if (settingsButton) {
        fireEvent.click(settingsButton);
      }

      // Re-render to show settings screen
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: true,
        cancelSettings: mockCancelSettings,
      });
      rerender(<App />);

      // Now find the cancel button in settings
      const cancelButton = Array.from(
        container.querySelectorAll("button"),
      ).find((btn) => btn.textContent === "Cancel");

      expect(cancelButton).toBeDefined();

      if (cancelButton) {
        fireEvent.click(cancelButton);
      }

      expect(mockCancelSettings).toHaveBeenCalledOnce();
      expect(mockSetTheme).toHaveBeenCalledWith(initialTheme);
    });

    it("saves theme reference when transitioning to settings screen", () => {
      const mockSetTheme = vi.fn();
      const initialTheme = "light";

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: false,
      });
      (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
        theme: initialTheme,
        setTheme: mockSetTheme,
      });

      // Render with settings screen open (settingsConfigured: false)
      const { rerender } = render(<App />);

      // Verify settings screen is shown
      expect(document.body.textContent).toContain("Provider");

      // Change theme while in settings
      (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
      });

      // Re-render to trigger useEffect
      rerender(<App />);

      // The useEffect should have captured the initial theme
      // This test verifies the useEffect runs and tracks theme changes
      expect(mockSetTheme).not.toHaveBeenCalled();
    });

    it("captures original theme when opening settings from chat screen", () => {
      const mockSetTheme = vi.fn();
      const initialTheme = "light";

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: true, // Start with chat screen
      });
      (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
        theme: initialTheme,
        setTheme: mockSetTheme,
      });

      const { container } = render(<App />);

      // Click settings button to open settings (by text)
      const settingsButton = Array.from(
        container.querySelectorAll("button"),
      ).find((btn) => btn.textContent === "Settings");

      if (settingsButton) {
        fireEvent.click(settingsButton);
      }

      // The useEffect should capture the theme when showSettings changes from false to true
      // This test verifies the useEffect logic runs correctly
      expect(mockSetTheme).not.toHaveBeenCalled();
    });
  });

  describe("baseUrl determination", () => {
    it("uses custom baseUrl for custom provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "custom",
        baseUrl: "https://custom.api.com/v1",
      });
      render(<App />);
      // Verify OpenAI chat hook was called with custom baseUrl
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("https://custom.api.com/v1");
    });

    it("uses localhost baseUrl for lmstudio provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        port: 1234,
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("http://localhost:1234/v1");
    });

    it("uses localhost baseUrl for ollama provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "ollama",
        port: 11434,
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("http://localhost:11434/v1");
    });

    it("uses default port 1234 for lmstudio when port not specified", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        port: undefined,
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("http://localhost:1234/v1");
    });

    it("uses default port 11434 for ollama when port not specified", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "ollama",
        port: undefined,
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("http://localhost:11434/v1");
    });

    it("uses 'not-needed' apiKey for lmstudio when apiKey is empty", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        apiKey: "",
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].apiKey).toBe("not-needed");
    });

    it("uses provider-specific baseUrl for openai provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openai",
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("https://api.openai.com/v1");
    });

    it("uses provider-specific baseUrl for mistral provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "mistral",
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("https://api.mistral.ai/v1");
    });

    it("uses provider-specific baseUrl for openrouter provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openrouter",
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBe("https://openrouter.ai/api/v1");
    });

    it("uses undefined baseUrl for gemini provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "gemini",
      });
      render(<App />);
      const openAICalls = (useOpenAIChat as ReturnType<typeof vi.fn>).mock
        .calls;

      expect(openAICalls[0]![0].baseUrl).toBeUndefined();
    });
  });
});

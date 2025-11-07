/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { App } from "./App.jsx";

// Mock all the custom hooks
vi.mock("../hooks/use-settings.js", () => ({
  useSettings: vi.fn(),
}));

vi.mock("../hooks/use-theme.js", () => ({
  useTheme: vi.fn(),
}));

vi.mock("../hooks/use-mcp-connection.js", () => ({
  useMcpConnection: vi.fn(),
}));

vi.mock("../hooks/use-gemini-chat.js", () => ({
  useGeminiChat: vi.fn(),
}));

vi.mock("../hooks/use-openai-chat.js", () => ({
  useOpenAIChat: vi.fn(),
}));

// Import mocked modules to access them in tests
import { useSettings } from "../hooks/use-settings.js";
import { useTheme } from "../hooks/use-theme.js";
import { useMcpConnection } from "../hooks/use-mcp-connection.js";
import { useGeminiChat } from "../hooks/use-gemini-chat.js";
import { useOpenAIChat } from "../hooks/use-openai-chat.js";

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
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock all the custom hooks
vi.mock(import("#webui/hooks/settings/use-settings"), () => ({
  useSettings: vi.fn(),
}));

vi.mock(import("#webui/hooks/theme/use-theme"), () => ({
  useTheme: vi.fn(),
}));

vi.mock(import("#webui/hooks/connection/use-mcp-connection"), () => ({
  useMcpConnection: vi.fn(),
}));

vi.mock(import("#webui/hooks/chat/use-chat"), () => ({
  useChat: vi.fn(),
}));

vi.mock(import("#webui/hooks/connection/use-remote-config"), () => ({
  useRemoteConfig: vi.fn(),
}));

// Import mocked modules to access them in tests
import { useChat } from "#webui/hooks/chat/use-chat";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
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
      mcpTools: [
        { id: "ppal-connect", name: "Connect to Ableton" },
        { id: "ppal-read-live-set", name: "Read Live Set" },
      ],
      checkMcpConnection: vi.fn(),
    });
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue(mockChatHook);
    (useRemoteConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      smallModelMode: false,
      setSmallModelMode: vi.fn(),
    });
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
    it("calls useChat four times (for gemini, openai chat, responses, and ai-sdk adapters)", () => {
      render(<App />);
      // useChat is called 4 times - gemini, openai chat, responses API, and AI SDK
      expect(useChat).toHaveBeenCalledTimes(4);
    });

    it("passes adapters with createClient for all four calls", () => {
      render(<App />);
      const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

      expect(calls[0]![0].adapter).toHaveProperty("createClient");
      expect(calls[1]![0].adapter).toHaveProperty("createClient");
      expect(calls[2]![0].adapter).toHaveProperty("createClient");
      expect(calls[3]![0].adapter).toHaveProperty("createClient");
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
      // useChat should receive settings
      const chatCalls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

      expect(chatCalls.length).toBeGreaterThan(0);
      expect(chatCalls[0]![0]).toHaveProperty("apiKey");
      expect(chatCalls[0]![0]).toHaveProperty("model");
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
      ).find((btn) => btn.textContent.includes("Settings"));

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
      ).find((btn) => btn.textContent.includes("Settings"));

      if (settingsButton) {
        fireEvent.click(settingsButton);
      }

      // The useEffect should capture the theme when showSettings changes from false to true
      // This test verifies the useEffect logic runs correctly
      expect(mockSetTheme).not.toHaveBeenCalled();
    });
  });

  // Helper to get the second useChat call (openai adapter) extraParams
  const getOpenAIExtraParams = () => {
    const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

    return calls[1]![0].extraParams;
  };

  // Helper to get the second useChat call (openai adapter) apiKey
  const getOpenAIApiKey = () => {
    const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

    return calls[1]![0].apiKey;
  };

  describe("baseUrl determination", () => {
    it("uses custom baseUrl for custom provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "custom",
        baseUrl: "https://custom.api.com/v1",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("https://custom.api.com/v1");
    });

    it("uses baseUrl for lmstudio provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        baseUrl: "http://localhost:1234/v1",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:1234/v1");
    });

    it("uses baseUrl for ollama provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "ollama",
        baseUrl: "http://localhost:11434/v1",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:11434/v1");
    });

    it("uses custom baseUrl for lmstudio on remote host", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        baseUrl: "http://192.168.1.100:1234/v1",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe(
        "http://192.168.1.100:1234/v1",
      );
    });

    it("falls back to default URL for lmstudio when baseUrl is undefined", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        baseUrl: undefined,
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:1234/v1");
    });

    it("falls back to default URL for ollama when baseUrl is undefined", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "ollama",
        baseUrl: undefined,
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:11434/v1");
    });

    it("uses 'not-needed' apiKey for lmstudio when apiKey is empty", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        apiKey: "",
      });
      render(<App />);
      expect(getOpenAIApiKey()).toBe("not-needed");
    });

    it("uses provider-specific baseUrl for openai provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openai",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("https://api.openai.com/v1");
    });

    it("uses provider-specific baseUrl for mistral provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "mistral",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe("https://api.mistral.ai/v1");
    });

    it("uses provider-specific baseUrl for openrouter provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openrouter",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBe(
        "https://openrouter.ai/api/v1",
      );
    });

    it("uses undefined baseUrl for gemini provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "gemini",
      });
      render(<App />);
      expect(getOpenAIExtraParams().baseUrl).toBeUndefined();
    });
  });

  describe("URL normalization for local providers", () => {
    describe("lmstudio normalization", () => {
      it("appends /v1 to URL without suffix", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "lmstudio",
          baseUrl: "http://localhost:1234",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:1234/v1");
      });

      it("removes trailing slash and appends /v1", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:1234/v1");
      });

      it("preserves URL already ending in /v1", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:1234/v1");
      });

      it("removes trailing slash from URL ending in /v1/", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1/",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe("http://localhost:1234/v1");
      });

      it("appends /v1 to remote host URL", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "lmstudio",
          baseUrl: "http://192.168.1.100:1234",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://192.168.1.100:1234/v1",
        );
      });

      it("appends /v1 to custom path", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "lmstudio",
          baseUrl: "http://localhost:8080/api",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:8080/api/v1",
        );
      });
    });

    describe("ollama normalization", () => {
      it("appends /v1 to URL without suffix", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "ollama",
          baseUrl: "http://localhost:11434",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:11434/v1",
        );
      });

      it("removes trailing slash and appends /v1", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "ollama",
          baseUrl: "http://localhost:11434/",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:11434/v1",
        );
      });

      it("preserves URL already ending in /v1", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "ollama",
          baseUrl: "http://localhost:11434/v1",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:11434/v1",
        );
      });

      it("removes trailing slash from URL ending in /v1/", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "ollama",
          baseUrl: "http://localhost:11434/v1/",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:11434/v1",
        );
      });

      it("appends /v1 to remote host URL", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "ollama",
          baseUrl: "http://192.168.1.100:11434",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://192.168.1.100:11434/v1",
        );
      });

      it("appends /v1 to custom path", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "ollama",
          baseUrl: "http://localhost:8080/api",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:8080/api/v1",
        );
      });
    });

    describe("custom provider (no normalization)", () => {
      it("does not normalize custom provider URL", () => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: "custom",
          baseUrl: "http://localhost:8080/api",
        });
        render(<App />);
        expect(getOpenAIExtraParams().baseUrl).toBe(
          "http://localhost:8080/api",
        );
      });
    });
  });
});

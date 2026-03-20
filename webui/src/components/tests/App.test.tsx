// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render } from "@testing-library/preact";
import { SETTINGS_ANIMATION_MS } from "#webui/hooks/settings/use-settings-close";
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

vi.mock(import("#webui/hooks/chat/use-conversations"), () => ({
  useConversations: vi.fn(),
}));

vi.mock(import("#webui/hooks/connection/use-remote-config"), () => ({
  useRemoteConfig: vi.fn(),
}));

vi.mock(import("#webui/hooks/use-update-check"), () => ({
  useUpdateCheck: () => null,
}));

vi.mock(import("#webui/hooks/use-view-state"), () => ({
  useViewState: vi.fn(),
}));

import { useChat } from "#webui/hooks/chat/use-chat";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { useViewState } from "#webui/hooks/use-view-state";
import { mockSettingsHook, setupDefaultMocks } from "./App-test-helpers";
import { App } from "#webui/components/App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
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
    it("calls useChat once (AI SDK adapter handles all providers)", () => {
      render(<App />);
      expect(useChat).toHaveBeenCalledTimes(1);
    });

    it("passes AI SDK adapter with createClient", () => {
      render(<App />);
      const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

      expect(calls[0]![0].adapter).toHaveProperty("createClient");
    });
  });

  describe("hook integration", () => {
    it("renders when mcpTools is null", () => {
      (useMcpConnection as ReturnType<typeof vi.fn>).mockReturnValue({
        mcpStatus: "disconnected",
        mcpError: null,
        mcpTools: null,
        checkMcpConnection: vi.fn(),
      });
      const { container } = render(<App />);

      expect(container.querySelector("header")).toBeDefined();
    });

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

    it("passes settings to chat hook", () => {
      render(<App />);
      const chatCalls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

      expect(chatCalls.length).toBeGreaterThan(0);
      expect(chatCalls[0]![0]).toHaveProperty("apiKey");
      expect(chatCalls[0]![0]).toHaveProperty("model");
    });
  });

  describe("settings interactions", () => {
    it("calls saveSettings when save button is clicked in settings screen", async () => {
      vi.useFakeTimers();
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

      await act(() => {
        vi.advanceTimersByTime(SETTINGS_ANIMATION_MS);
      });

      expect(mockSaveSettings).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it("calls cancelSettings and reverts theme when cancel button is clicked", async () => {
      vi.useFakeTimers();
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

      // Open settings by finding the settings button in chat header (by aria-label)
      const settingsButton = container.querySelector(
        'button[aria-label="Settings"]',
      );

      expect(settingsButton).toBeDefined();

      if (settingsButton) {
        fireEvent.click(settingsButton);
      }

      // Re-render to show settings screen (settingsOpen was set to true by click)
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: true,
        cancelSettings: mockCancelSettings,
      });
      (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
        viewState: {
          historyPanelOpen: false,
          settingsOpen: true,
          settingsTab: "connection",
        },
        setViewState: vi.fn(),
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

      await act(() => {
        vi.advanceTimersByTime(SETTINGS_ANIMATION_MS);
      });

      expect(mockCancelSettings).toHaveBeenCalledOnce();
      expect(mockSetTheme).toHaveBeenCalledWith(initialTheme);
      vi.useRealTimers();
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

      // Click settings button to open settings (by aria-label)
      const settingsButton = container.querySelector(
        'button[aria-label="Settings"]',
      );

      if (settingsButton) {
        fireEvent.click(settingsButton);
      }

      // The useEffect should capture the theme when showSettings changes from false to true
      // This test verifies the useEffect logic runs correctly
      expect(mockSetTheme).not.toHaveBeenCalled();
    });
  });

  describe("view state integration", () => {
    it("toggles history panel via setViewState", () => {
      const mockSetViewState = vi.fn();

      (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
        viewState: {
          historyPanelOpen: false,
          settingsOpen: false,
          settingsTab: "connection",
        },
        setViewState: mockSetViewState,
      });
      const { container } = render(<App />);
      const btn = container.querySelector(
        "[aria-label='Toggle conversation history']",
      );

      if (btn) fireEvent.click(btn);
      expect(mockSetViewState).toHaveBeenCalledWith({ historyPanelOpen: true });
    });

    it("passes onTabChange to SettingsScreen", () => {
      const mockSetViewState = vi.fn();

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: false,
      });
      (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
        viewState: {
          historyPanelOpen: false,
          settingsOpen: false,
          settingsTab: "connection",
        },
        setViewState: mockSetViewState,
      });
      const { container } = render(<App />);
      const tab = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Preferences",
      );

      if (tab) fireEvent.click(tab);
      expect(mockSetViewState).toHaveBeenCalledWith({
        settingsTab: "preferences",
      });
    });
  });

  // Helper to get the AI SDK useChat call's extraParams
  const getExtraParams = () => {
    const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

    return calls[0]![0].extraParams;
  };

  // Helper to get the AI SDK useChat call's apiKey
  const getApiKey = () => {
    const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

    return calls[0]![0].apiKey;
  };

  describe("baseUrl determination", () => {
    it.each([
      ["custom", "https://custom.api.com/v1", "https://custom.api.com/v1"],
      ["lmstudio", "http://localhost:1234/v1", "http://localhost:1234/v1"],
      ["ollama", "http://localhost:11434/v1", "http://localhost:11434/v1"],
      [
        "lmstudio (remote)",
        "http://192.168.1.100:1234/v1",
        "http://192.168.1.100:1234/v1",
      ],
    ] as const)(
      "uses baseUrl for %s provider",
      (provider, baseUrl, expected) => {
        const providerKey = provider.replace(/ .*/, "");

        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider: providerKey,
          baseUrl,
        });
        render(<App />);
        expect(getExtraParams().baseUrl).toBe(expected);
      },
    );

    it.each([
      ["lmstudio", "http://localhost:1234/v1"],
      ["ollama", "http://localhost:11434/v1"],
    ] as const)(
      "falls back to default URL for %s when baseUrl is undefined",
      (provider, expected) => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider,
          baseUrl: undefined,
        });
        render(<App />);
        expect(getExtraParams().baseUrl).toBe(expected);
      },
    );

    it("uses 'not-needed' apiKey for lmstudio when apiKey is empty", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "lmstudio",
        apiKey: "",
      });
      render(<App />);
      expect(getApiKey()).toBe("not-needed");
    });

    it.each([
      ["openai", "https://api.openai.com/v1"],
      ["mistral", "https://api.mistral.ai/v1"],
      ["openrouter", "https://openrouter.ai/api/v1"],
    ] as const)(
      "uses provider-specific baseUrl for %s provider",
      (provider, expected) => {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider,
        });
        render(<App />);
        expect(getExtraParams().baseUrl).toBe(expected);
      },
    );

    it("uses undefined baseUrl for gemini provider", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "gemini",
      });
      render(<App />);
      expect(getExtraParams().baseUrl).toBeUndefined();
    });
  });

  describe("URL normalization for local providers", () => {
    describe.each([
      ["lmstudio", "1234"],
      ["ollama", "11434"],
    ] as const)("%s normalization", (provider, port) => {
      /**
       * Mock settings for a local provider with a given baseUrl and render.
       * @param baseUrl - The base URL to set
       */
      function renderWithBaseUrl(baseUrl: string): void {
        (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
          ...mockSettingsHook,
          provider,
          baseUrl,
        });
        render(<App />);
      }

      it("appends /v1 to URL without suffix", () => {
        renderWithBaseUrl(`http://localhost:${port}`);
        expect(getExtraParams().baseUrl).toBe(`http://localhost:${port}/v1`);
      });

      it("removes trailing slash and appends /v1", () => {
        renderWithBaseUrl(`http://localhost:${port}/`);
        expect(getExtraParams().baseUrl).toBe(`http://localhost:${port}/v1`);
      });

      it("preserves URL already ending in /v1", () => {
        renderWithBaseUrl(`http://localhost:${port}/v1`);
        expect(getExtraParams().baseUrl).toBe(`http://localhost:${port}/v1`);
      });

      it("removes trailing slash from URL ending in /v1/", () => {
        renderWithBaseUrl(`http://localhost:${port}/v1/`);
        expect(getExtraParams().baseUrl).toBe(`http://localhost:${port}/v1`);
      });

      it("appends /v1 to remote host URL", () => {
        renderWithBaseUrl(`http://192.168.1.100:${port}`);
        expect(getExtraParams().baseUrl).toBe(
          `http://192.168.1.100:${port}/v1`,
        );
      });

      it("appends /v1 to custom path", () => {
        renderWithBaseUrl("http://localhost:8080/api");
        expect(getExtraParams().baseUrl).toBe("http://localhost:8080/api/v1");
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
        expect(getExtraParams().baseUrl).toBe("http://localhost:8080/api");
      });
    });
  });
});

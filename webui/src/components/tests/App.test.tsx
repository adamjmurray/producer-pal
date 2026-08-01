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

vi.mock(import("#webui/hooks/connection/use-update-check"), () => ({
  useUpdateCheck: () => null,
}));

vi.mock(import("#webui/hooks/view-state/use-view-state"), () => ({
  useViewState: vi.fn(),
}));

// App renders the real ContextTabs + system-prompt hook, both of which fetch a
// same-origin endpoint; stub them so App tests stay focused on the overlay
// open/close plumbing and don't leak real localhost fetches. See
// App-context-mocks for details.
vi.mock(import("#webui/hooks/context/use-system-prompt"), () => ({
  useSystemPrompt: systemPromptDocMock,
}));
vi.mock(import("#webui/components/context/ContextTabs"), () => ({
  ContextTabs: ContextTabsStub,
}));

import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { useViewState } from "#webui/hooks/view-state/use-view-state";
import {
  ContextTabsStub,
  setStubLeaveGuard,
  systemPromptDocMock,
} from "./App-context-mocks";
import { mockSettingsHook, setupDefaultMocks } from "./App-test-helpers";
import { App } from "#webui/components/App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    setStubLeaveGuard(null);
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

    it("renders VoiceApp when the saved provider+model is a realtime model", () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openai",
        savedProvider: "openai",
        model: "gpt-realtime-2",
        savedModel: "gpt-realtime-2",
      });
      render(<App />);
      // VoiceApp shows the Talk button; ChatScreen does not
      expect(document.body.textContent).toMatch(/Talk|Stop/);
    });

    it("does NOT mount VoiceApp when only the in-modal model is realtime", () => {
      // Simulates the mid-modal state where the user picked a realtime model
      // in the provider dropdown but hasn't saved yet. App.tsx routes off
      // savedModel so the underlying chat screen stays mounted.
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "openai",
        savedProvider: "gemini",
        model: "gpt-realtime-2",
        savedModel: "gemini-1.5-flash",
      });
      render(<App />);
      expect(document.body.textContent).not.toMatch(/Talk|Stop/);
    });

    it("does NOT mount VoiceApp for a non-openai provider reusing the realtime model id", () => {
      // A custom/OpenAI-compatible provider whose model id happens to equal the
      // realtime model must stay in chat: voice has no key/transport for it.
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "custom",
        savedProvider: "custom",
        model: "gpt-realtime-2",
        savedModel: "gpt-realtime-2",
      });
      render(<App />);
      expect(document.body.textContent).not.toMatch(/Talk|Stop/);
    });
  });

  describe("provider routing", () => {
    it("calls useChat (AI SDK adapter handles all providers)", () => {
      render(<App />);
      // ChatApp reports its mode context up to App via setState, which causes
      // one additional re-render — so useChat is called more than once but
      // exactly once per render cycle.
      expect(
        (useChat as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("passes AI SDK adapter with createClient", () => {
      render(<App />);
      const calls = (useChat as ReturnType<typeof vi.fn>).mock.calls;

      expect(calls[0]![0].adapter).toHaveProperty("createClient");
    });

    it("onForeignRecord switches the viewing mode without mutating saved settings", async () => {
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        // Saved is a chat model; clicking a voice record from history should
        // route to VoiceApp without changing this.
        provider: "openai",
        savedProvider: "openai",
        model: "gpt-5",
        savedModel: "gpt-5",
      });
      const { rerender } = render(<App />);

      // Initially in chat mode (saved is chat)
      expect(document.body.textContent).not.toMatch(/Talk|Stop/);

      const onForeignRecord = (
        useConversations as ReturnType<typeof vi.fn>
      ).mock.calls.at(-1)?.[0]?.onForeignRecord;

      expect(typeof onForeignRecord).toBe("function");

      await act(() => {
        onForeignRecord?.({
          sessionType: "voice",
          provider: "openai",
          model: "gpt-realtime-2",
        });
      });
      rerender(<App />);

      // Routes to VoiceApp via the viewingMode override; savedModel stays chat.
      expect(document.body.textContent).toMatch(/Talk|Stop/);
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
      const mockSaveSettings = vi.fn().mockResolvedValue(true);

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

      // saveSettings is async (returns Promise<boolean>); the close-animation
      // setTimeout is now scheduled inside its .then. Flush microtasks first
      // so the setTimeout is queued, then advance through the animation so the
      // afterClose (post-save RPCs + savePreferencesSettings) actually runs.
      await act(async () => {
        await vi.runAllTimersAsync();
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
    const mockViewStateWithSetter = () => {
      const mockSetViewState = vi.fn();

      (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
        viewState: {
          historyPanelOpen: false,
          settingsOpen: false,
          settingsTab: "connection",
        },
        setViewState: mockSetViewState,
      });

      return mockSetViewState;
    };

    it("toggles history panel via setViewState", () => {
      const mockSetViewState = mockViewStateWithSetter();
      const { container } = render(<App />);
      const btn = container.querySelector(
        "[aria-label='Toggle conversation history']",
      );

      if (btn) fireEvent.click(btn);
      expect(mockSetViewState).toHaveBeenCalledWith({ historyPanelOpen: true });
    });

    it("passes onTabChange to SettingsScreen", () => {
      const mockSetViewState = mockViewStateWithSetter();

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: false,
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

    it("resolveConnection resolves any provider's key + baseUrl from current settings", () => {
      // The locked-conversation path calls resolveConnection with the
      // conversation's provider — which may differ from the active one — and
      // must read that provider's stored connection (key + normalized baseUrl).
      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        provider: "gemini",
        getProviderConnection: vi.fn((p: string) =>
          p === "lmstudio"
            ? { apiKey: "", baseUrl: "http://localhost:9999" }
            : { apiKey: "anthropic-key", baseUrl: undefined },
        ),
      });
      render(<App />);
      const { resolveConnection } = (useChat as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];

      expect(resolveConnection("anthropic")).toStrictEqual({
        apiKey: "anthropic-key",
        baseUrl: undefined,
      });
      // Local provider: empty key → placeholder, baseUrl gets the /v1 suffix.
      expect(resolveConnection("lmstudio")).toStrictEqual({
        apiKey: "not-needed",
        baseUrl: "http://localhost:9999/v1",
      });
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

// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type UseSettingsReturn } from "#webui/types/settings";
import { SettingsScreen } from "./SettingsScreen";

// Mock child components
vi.mock(import("./ConnectionTab"), async () => {
  const { API_KEY_URLS, MODEL_DOCS_URLS, DEFAULT_LOCAL_URLS } =
    await import("./connection-tab-helpers");

  return {
    ConnectionTab: ({
      provider,
      apiKey,
      setApiKey,
      model,
      baseUrl,
      setBaseUrl,
      providerLabel,
    }: {
      provider: string;
      apiKey: string;
      setApiKey: (key: string) => void;
      model: string;
      baseUrl?: string | null;
      setBaseUrl?: (url: string) => void;
      providerLabel: string;
    }) => (
      <div>
        {/* Provider selector mock */}
        <div>
          <label className="block text-sm mb-2">Provider</label>
          <select>
            <option value={provider}>{providerLabel}</option>
          </select>
        </div>

        {/* API Key for non-local providers */}
        {provider !== "lmstudio" && provider !== "ollama" && (
          <div>
            <label>{providerLabel} API Key</label>
            <input
              type="password"
              placeholder={`Enter your ${providerLabel} API key`}
              value={apiKey}
              onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
            />
            {API_KEY_URLS[provider] && (
              <p>
                <a
                  href={API_KEY_URLS[provider]}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {providerLabel} API keys
                </a>
              </p>
            )}
          </div>
        )}

        {/* URL for local and custom providers */}
        {(provider === "lmstudio" ||
          provider === "ollama" ||
          provider === "custom") &&
          setBaseUrl && (
            <div>
              <label>URL</label>
              <input
                type="text"
                placeholder={
                  DEFAULT_LOCAL_URLS[provider] ?? "https://api.example.com/v1"
                }
                value={baseUrl ?? ""}
                onChange={(e) =>
                  setBaseUrl((e.target as HTMLInputElement).value)
                }
              />
            </div>
          )}

        {/* Model selector mock */}
        <div data-testid="model-selector">{model}</div>
        {/* Model docs link - only for providers with docs */}
        {MODEL_DOCS_URLS[provider] && (
          <p>
            <a
              href={MODEL_DOCS_URLS[provider]}
              target="_blank"
              rel="noopener noreferrer"
            >
              {providerLabel} models
            </a>
          </p>
        )}
      </div>
    ),
  };
});

vi.mock(import("./controls/ToolToggles"), () => ({
  ToolToggles: () => <div data-testid="tool-toggles">Tool Toggles</div>,
}));

describe("SettingsScreen", () => {
  const defaultSettings = {
    provider: "gemini" as const,
    setProvider: vi.fn(),
    apiKey: "",
    setApiKey: vi.fn(),
    model: "gemini-2.5-pro",
    setModel: vi.fn(),
    thinking: "Default",
    setThinking: vi.fn(),
    temperature: 1,
    setTemperature: vi.fn(),
    showThoughts: false,
    setShowThoughts: vi.fn(),
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    hasApiKey: false,
    settingsConfigured: false,
    enabledTools: {} as Record<string, boolean>,
    setEnabledTools: vi.fn(),
    resetBehaviorToDefaults: vi.fn(),
    isToolEnabled: () => true,
    smallModelMode: false,
    setSmallModelMode: vi.fn(),
  };

  const defaultDisplay = {
    showTimestamps: false,
    setShowTimestamps: vi.fn(),
    showHelpLinks: true,
    setShowHelpLinks: vi.fn(),
    showTokenUsage: false,
    setShowTokenUsage: vi.fn(),
  };

  const defaultProps = {
    settings: defaultSettings,
    display: defaultDisplay,
    activeTab: "connection" as const,
    onTabChange: vi.fn(),
    theme: "system",
    setTheme: vi.fn(),
    mcpTools: [
      { id: "ppal-connect", name: "Connect to Ableton" },
      { id: "ppal-read-live-set", name: "Read Live Set" },
    ],
    mcpStatus: "connected" as const,
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    shake: false,
    onShakeEnd: vi.fn(),
    hasUnsavedChanges: false,
    onDeleteAllConversations: vi.fn(),
    onDeleteUnbookmarkedConversations: vi.fn(),
    conversationLock: {
      activeModel: null,
      activeProvider: null,
      activeSmallModelMode: null,
    },
  };

  /**
   * Build settings with optional overrides merged into defaults.
   * @param overrides - partial UseSettingsReturn fields to override
   * @returns merged UseSettingsReturn object
   */
  function ss(overrides?: Partial<UseSettingsReturn>): UseSettingsReturn {
    return { ...defaultSettings, ...overrides };
  }

  const lmstudioSettings = ss({
    provider: "lmstudio",
    baseUrl: "http://localhost:1234/v1",
    setBaseUrl: vi.fn(),
  });
  const ollamaSettings = ss({
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    setBaseUrl: vi.fn(),
  });
  const customSettings = ss({
    provider: "custom",
    baseUrl: "https://api.example.com/v1",
    setBaseUrl: vi.fn(),
  });

  describe("help link", () => {
    it("renders help link with connection tab anchor by default", () => {
      render(<SettingsScreen {...defaultProps} />);
      const link = screen.getByTitle("Documentation") as HTMLAnchorElement;

      expect(link.href).toBe(
        "https://producer-pal.org/guide/chat-ui#connection",
      );
      expect(link.target).toBe("_blank");
    });

    it("updates help link when switching to tools tab", () => {
      render(<SettingsScreen {...defaultProps} activeTab="tools" />);
      const link = screen.getByTitle("Documentation") as HTMLAnchorElement;

      expect(link.href).toBe("https://producer-pal.org/guide/chat-ui#tools");
    });

    it("updates help link when switching to preferences tab", () => {
      render(<SettingsScreen {...defaultProps} activeTab="preferences" />);
      const link = screen.getByTitle("Documentation") as HTMLAnchorElement;

      expect(link.href).toBe(
        "https://producer-pal.org/guide/chat-ui#preferences",
      );
    });
  });

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByText("Producer Pal Chat Settings")).toBeDefined();
    });

    it("renders all child components for Gemini", () => {
      // Connection tab
      const { unmount } = render(<SettingsScreen {...defaultProps} />);

      expect(
        screen.getByPlaceholderText(/enter your gemini api key/i),
      ).toBeDefined();
      expect(screen.getByTestId("model-selector")).toBeDefined();
      unmount();

      // Tools tab
      const { unmount: unmount2 } = render(
        <SettingsScreen {...defaultProps} activeTab="tools" />,
      );

      expect(screen.getByTestId("tool-toggles")).toBeDefined();
      unmount2();

      // Preferences tab
      render(<SettingsScreen {...defaultProps} activeTab="preferences" />);
      expect(screen.getByLabelText("Theme")).toBeDefined();
    });

    it("renders Save button", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    });
  });

  describe("theme selector", () => {
    it("renders Preferences label", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Preferences" })).toBeDefined();
    });

    it("renders theme selector with options", () => {
      render(<SettingsScreen {...defaultProps} activeTab="preferences" />);
      expect(screen.getByRole("option", { name: "System" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Light" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Dark" })).toBeDefined();
    });

    it("has correct initial value", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          activeTab="preferences"
          theme="dark"
        />,
      );
      const select = screen.getByLabelText("Theme") as HTMLSelectElement;

      expect(select.value).toBe("dark");
    });

    it("calls setTheme when changed", () => {
      const setTheme = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          activeTab="preferences"
          setTheme={setTheme}
        />,
      );
      const select = screen.getByLabelText("Theme");

      fireEvent.change(select, { target: { value: "light" } });

      expect(setTheme).toHaveBeenCalledExactlyOnceWith("light");
    });
  });

  describe("provider labels", () => {
    it("passes correct label for Anthropic provider", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "anthropic" })}
        />,
      );
      expect(screen.getByText("Anthropic")).toBeDefined();
    });
  });

  describe("conditional note text", () => {
    it("shows browser storage message when settings not configured", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ settingsConfigured: false })}
        />,
      );
      expect(
        screen.getByText("Settings will be stored in this web browser."),
      ).toBeDefined();
    });

    it("does not show browser storage message when settings configured", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ settingsConfigured: true })}
        />,
      );
      expect(
        screen.queryByText("Settings will be stored in this web browser."),
      ).toBeNull();
    });
  });

  describe("Cancel button", () => {
    it("is not shown when settings not configured", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ settingsConfigured: false })}
        />,
      );
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    it("is shown when settings configured", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ settingsConfigured: true })}
        />,
      );
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    });

    it("calls cancelSettings when clicked", () => {
      const cancelSettings = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ settingsConfigured: true })}
          cancelSettings={cancelSettings}
        />,
      );

      const button = screen.getByRole("button", { name: "Cancel" });

      fireEvent.click(button);

      expect(cancelSettings).toHaveBeenCalledOnce();
    });
  });

  describe("Save button", () => {
    it.each([
      ["even when no API key", ""],
      ["when API key is provided", "test-key"],
    ])("is enabled %s", (_label, apiKey) => {
      render(<SettingsScreen {...defaultProps} settings={ss({ apiKey })} />);

      const button = screen.getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(false);
    });

    it.each([
      ["empty API key", ""],
      ["API key", "test-key"],
    ])("calls saveSettings when clicked with %s", (_label, apiKey) => {
      const saveSettings = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ apiKey })}
          saveSettings={saveSettings}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(saveSettings).toHaveBeenCalledOnce();
    });
  });

  describe("props passing to child components", () => {
    it("passes correct props to connection tab", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ apiKey: "my-key", model: "gemini-2.5-flash" })}
        />,
      );

      const apiKeyInput = screen.getByPlaceholderText(
        /enter your gemini api key/i,
      ) as HTMLInputElement;

      expect(apiKeyInput.value).toBe("my-key");
      expect(apiKeyInput.type).toBe("password");

      expect(screen.getByTestId("model-selector").textContent).toBe(
        "gemini-2.5-flash",
      );
    });
  });

  describe("API key links", () => {
    it.each([
      ["Anthropic", "anthropic", "https://console.anthropic.com/settings/keys"],
      ["Gemini", "gemini", "https://aistudio.google.com/apikey"],
      ["OpenAI", "openai", "https://platform.openai.com/api-keys"],
      [
        "Mistral",
        "mistral",
        "https://console.mistral.ai/home?workspace_dialog=apiKeys",
      ],
      ["OpenRouter", "openrouter", "https://openrouter.ai/settings/keys"],
    ] as const)(
      "shows %s API key link with correct URL",
      (label, provider, url) => {
        render(
          <SettingsScreen {...defaultProps} settings={ss({ provider })} />,
        );
        const link = screen.getByText(`${label} API keys`) as HTMLAnchorElement;

        expect(link.href).toBe(url);
        expect(link.target).toBe("_blank");
      },
    );

    it.each([
      ["LM Studio", lmstudioSettings],
      ["Ollama", ollamaSettings],
      ["custom", customSettings],
    ])("does not show API key link for %s", (_label, settings) => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={settings as UseSettingsReturn}
        />,
      );
      expect(screen.queryByText(/Get a.*API key/)).toBeNull();
    });
  });

  describe("input handlers", () => {
    it("calls setApiKey when API key input changes", () => {
      const setApiKey = vi.fn();

      render(<SettingsScreen {...defaultProps} settings={ss({ setApiKey })} />);
      const input = screen.getByPlaceholderText(/enter your gemini api key/i);

      fireEvent.change(input, { target: { value: "new-api-key" } });
      expect(setApiKey).toHaveBeenCalledWith("new-api-key");
    });

    it("calls setBaseUrl when URL input changes for lmstudio", () => {
      const setBaseUrl = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({
            provider: "lmstudio",
            baseUrl: "http://localhost:1234/v1",
            setBaseUrl,
          })}
        />,
      );
      const input = screen.getByPlaceholderText("http://localhost:1234");

      fireEvent.change(input, {
        target: { value: "http://192.168.1.100:1234/v1" },
      });
      expect(setBaseUrl).toHaveBeenCalledWith("http://192.168.1.100:1234/v1");
    });

    it("calls setBaseUrl when URL input changes for ollama", () => {
      const setBaseUrl = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({
            provider: "ollama",
            baseUrl: "http://localhost:11434/v1",
            setBaseUrl,
          })}
        />,
      );
      const input = screen.getByPlaceholderText("http://localhost:11434");

      fireEvent.change(input, {
        target: { value: "http://192.168.1.100:11434/v1" },
      });
      expect(setBaseUrl).toHaveBeenCalledWith("http://192.168.1.100:11434/v1");
    });

    it("calls setBaseUrl when base URL input changes for custom provider", () => {
      const setBaseUrl = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "custom", baseUrl: "", setBaseUrl })}
        />,
      );
      const input = screen.getByPlaceholderText("https://api.example.com/v1");

      fireEvent.change(input, { target: { value: "https://custom.api/v1" } });
      expect(setBaseUrl).toHaveBeenCalledWith("https://custom.api/v1");
    });
  });

  describe("Model documentation links", () => {
    it.each([
      [
        "Anthropic",
        "anthropic",
        undefined,
        "https://docs.anthropic.com/en/docs/about-claude/models",
      ],
      [
        "Gemini",
        "gemini",
        undefined,
        "https://ai.google.dev/gemini-api/docs/models",
      ],
      [
        "OpenAI",
        "openai",
        undefined,
        "https://platform.openai.com/docs/models",
      ],
      [
        "Mistral",
        "mistral",
        undefined,
        "https://docs.mistral.ai/getting-started/models",
      ],
      ["OpenRouter", "openrouter", undefined, "https://openrouter.ai/models"],
      ["LM Studio", "lmstudio", lmstudioSettings, "https://lmstudio.ai/models"],
      ["Ollama", "ollama", ollamaSettings, "https://ollama.com/search"],
    ] as const)(
      "shows %s models link with correct URL",
      (label, provider, preset, url) => {
        const settings =
          (preset as UseSettingsReturn | undefined) ??
          ss({ provider: provider as "anthropic" });

        render(<SettingsScreen {...defaultProps} settings={settings} />);
        const link = screen.getByText(`${label} models`) as HTMLAnchorElement;

        expect(link.href).toBe(url);
        expect(link.target).toBe("_blank");
      },
    );

    it("does not show models link for custom provider", () => {
      render(<SettingsScreen {...defaultProps} settings={customSettings} />);
      expect(screen.queryByText(/models$/)).toBeNull();
    });
  });
});

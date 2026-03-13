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
vi.mock(import("./ConnectionTab"), async (importOriginal) => {
  const { API_KEY_URLS, MODEL_DOCS_URLS, DEFAULT_LOCAL_URLS } =
    await importOriginal();

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

    it("updates help link when switching to display tab", () => {
      render(<SettingsScreen {...defaultProps} activeTab="display" />);
      const link = screen.getByTitle("Documentation") as HTMLAnchorElement;

      expect(link.href).toBe("https://producer-pal.org/guide/chat-ui#display");
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

      // Display tab
      render(<SettingsScreen {...defaultProps} activeTab="display" />);
      expect(screen.getByLabelText("Theme")).toBeDefined();
    });

    it("renders Save button", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    });
  });

  describe("theme selector", () => {
    it("renders Display label", () => {
      render(<SettingsScreen {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Display" })).toBeDefined();
    });

    it("renders theme selector with options", () => {
      render(<SettingsScreen {...defaultProps} activeTab="display" />);
      expect(screen.getByRole("option", { name: "System" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Light" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Dark" })).toBeDefined();
    });

    it("has correct initial value", () => {
      render(
        <SettingsScreen {...defaultProps} activeTab="display" theme="dark" />,
      );
      const select = screen.getByLabelText("Theme") as HTMLSelectElement;

      expect(select.value).toBe("dark");
    });

    it("calls setTheme when changed", () => {
      const setTheme = vi.fn();

      render(
        <SettingsScreen
          {...defaultProps}
          activeTab="display"
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
    it("is enabled even when no API key", () => {
      render(
        <SettingsScreen {...defaultProps} settings={ss({ apiKey: "" })} />,
      );

      const button = screen.getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(false);
    });

    it("is enabled when API key is provided", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ apiKey: "test-key" })}
        />,
      );

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
          settings={ss({ apiKey: "" })}
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
          settings={ss({ apiKey: "test-key" })}
          saveSettings={saveSettings}
        />,
      );

      const button = screen.getByRole("button", { name: "Save" });

      fireEvent.click(button);

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
    it("shows Anthropic API key link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "anthropic" })}
        />,
      );
      const link = screen.getByText("Anthropic API keys");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://console.anthropic.com/settings/keys",
      );
      expect((link as HTMLAnchorElement).target).toBe("_blank");
    });

    it("shows Gemini API key link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "gemini" })}
        />,
      );
      const link = screen.getByText("Gemini API keys");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://aistudio.google.com/apikey",
      );
      expect((link as HTMLAnchorElement).target).toBe("_blank");
    });

    it("shows OpenAI API key link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "openai" })}
        />,
      );
      const link = screen.getByText("OpenAI API keys");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://platform.openai.com/api-keys",
      );
    });

    it("shows Mistral API key link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "mistral" })}
        />,
      );
      const link = screen.getByText("Mistral API keys");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://console.mistral.ai/home?workspace_dialog=apiKeys",
      );
    });

    it("shows OpenRouter API key link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "openrouter" })}
        />,
      );
      const link = screen.getByText("OpenRouter API keys");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://openrouter.ai/settings/keys",
      );
    });

    it("does not show API key link for LM Studio", () => {
      render(<SettingsScreen {...defaultProps} settings={lmstudioSettings} />);
      expect(screen.queryByText(/Get a.*API key/)).toBeNull();
    });

    it("does not show API key link for Ollama", () => {
      render(<SettingsScreen {...defaultProps} settings={ollamaSettings} />);
      expect(screen.queryByText(/Get a.*API key/)).toBeNull();
    });

    it("does not show API key link for custom provider", () => {
      render(<SettingsScreen {...defaultProps} settings={customSettings} />);
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
    it("shows Anthropic models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "anthropic" })}
        />,
      );
      const link = screen.getByText("Anthropic models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://docs.anthropic.com/en/docs/about-claude/models",
      );
      expect((link as HTMLAnchorElement).target).toBe("_blank");
    });

    it("shows Gemini models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "gemini" })}
        />,
      );
      const link = screen.getByText("Gemini models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://ai.google.dev/gemini-api/docs/models",
      );
      expect((link as HTMLAnchorElement).target).toBe("_blank");
    });

    it("shows OpenAI models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "openai" })}
        />,
      );
      const link = screen.getByText("OpenAI models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://platform.openai.com/docs/models",
      );
    });

    it("shows Mistral models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "mistral" })}
        />,
      );
      const link = screen.getByText("Mistral models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://docs.mistral.ai/getting-started/models",
      );
    });

    it("shows OpenRouter models link with correct URL", () => {
      render(
        <SettingsScreen
          {...defaultProps}
          settings={ss({ provider: "openrouter" })}
        />,
      );
      const link = screen.getByText("OpenRouter models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://openrouter.ai/models",
      );
    });

    it("shows LM Studio models link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} settings={lmstudioSettings} />);
      const link = screen.getByText("LM Studio models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://lmstudio.ai/models",
      );
    });

    it("shows Ollama models link with correct URL", () => {
      render(<SettingsScreen {...defaultProps} settings={ollamaSettings} />);
      const link = screen.getByText("Ollama models");

      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toBe(
        "https://ollama.com/search",
      );
    });

    it("does not show models link for custom provider", () => {
      render(<SettingsScreen {...defaultProps} settings={customSettings} />);
      expect(screen.queryByText(/models$/)).toBeNull();
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettings } from "./use-settings";

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads default values when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current).toMatchObject({
      apiKey: "",
      model: "gemini-2.5-flash",
      thinking: "Default",
      temperature: 1.0,
      showThoughts: true,
      hasApiKey: false,
    });
  });

  it("migrates Gemini settings from old localStorage format", () => {
    localStorage.setItem("gemini_api_key", "test-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");
    localStorage.setItem("thinking", "High");
    localStorage.setItem("temperature", "0.7");
    localStorage.setItem("showThoughts", "false");

    const { result } = renderHook(() => useSettings());

    expect(result.current).toMatchObject({
      apiKey: "test-key",
      model: "gemini-2.5-pro",
      thinking: "High",
      temperature: 0.7,
      showThoughts: false,
      hasApiKey: true,
    });
  });

  it("loads from new JSON blob format", () => {
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({
        apiKey: "new-key",
        model: "gemini-2.5-flash-lite",
        thinking: "Low",
        temperature: 1.5,
        showThoughts: false,
      }),
    );

    const { result } = renderHook(() => useSettings());

    expect(result.current).toMatchObject({
      apiKey: "new-key",
      model: "gemini-2.5-flash-lite",
      thinking: "Low",
      temperature: 1.5,
      showThoughts: false,
      hasApiKey: true,
    });
  });

  it("prefers new format over old format", () => {
    // Set both old and new formats
    localStorage.setItem("gemini_api_key", "old-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({
        apiKey: "new-key",
        model: "gemini-2.5-flash-lite",
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      }),
    );

    const { result } = renderHook(() => useSettings());

    // Should use new format
    expect(result.current.apiKey).toBe("new-key");
    expect(result.current.model).toBe("gemini-2.5-flash-lite");
  });

  it("updates apiKey when setApiKey is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setApiKey("new-key");
    });

    expect(result.current.apiKey).toBe("new-key");
  });

  it("updates model when setModel is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setModel("gemini-2.5-flash-lite");
    });

    expect(result.current.model).toBe("gemini-2.5-flash-lite");
  });

  it("updates thinking when setThinking is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setThinking("Low");
    });

    expect(result.current.thinking).toBe("Low");
  });

  it("updates temperature when setTemperature is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setTemperature(0.5);
    });

    expect(result.current.temperature).toBe(0.5);
  });

  it("updates showThoughts when setShowThoughts is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setShowThoughts(false);
    });

    expect(result.current.showThoughts).toBe(false);
  });

  it("saves settings to new JSON blob format", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setApiKey("new-key");
      result.current.setModel("gemini-2.5-flash-lite");
      result.current.setThinking("Medium");
      result.current.setTemperature(0.8);
      result.current.setShowThoughts(false);
    });

    await act(() => {
      result.current.saveSettings();
    });

    expect(localStorage.getItem("producer_pal_current_provider")).toBe(
      "gemini",
    );

    expect(
      JSON.parse(localStorage.getItem("producer_pal_provider_gemini") ?? "{}"),
    ).toMatchObject({
      apiKey: "new-key",
      model: "gemini-2.5-flash-lite",
      thinking: "Medium",
      temperature: 0.8,
      showThoughts: false,
    });
  });

  it("reverts to saved settings on cancel", async () => {
    localStorage.setItem("gemini_api_key", "saved-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");

    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setApiKey("temporary-key");
      result.current.setModel("gemini-2.5-flash");
    });

    expect(result.current.apiKey).toBe("temporary-key");
    expect(result.current.model).toBe("gemini-2.5-flash");

    await act(() => {
      result.current.cancelSettings();
    });

    expect(result.current.apiKey).toBe("saved-key");
    expect(result.current.model).toBe("gemini-2.5-pro");
  });

  it("hasApiKey returns false when no key in localStorage", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.hasApiKey).toBe(false);
  });

  it("hasApiKey returns true when key exists in old format", () => {
    localStorage.setItem("gemini_api_key", "test-key");
    const { result } = renderHook(() => useSettings());

    expect(result.current.hasApiKey).toBe(true);
  });

  it("hasApiKey returns true when key exists in new format", () => {
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({ apiKey: "test-key" }),
    );
    const { result } = renderHook(() => useSettings());

    expect(result.current.hasApiKey).toBe(true);
  });

  it("remembers all settings per provider when switching", async () => {
    const { result } = renderHook(() => useSettings());

    // Configure Gemini with custom settings
    await act(() => {
      result.current.setApiKey("gemini-key");
      result.current.setModel("gemini-2.5-pro");
      result.current.setThinking("High");
      result.current.setTemperature(0.5);
      result.current.setShowThoughts(false);
    });

    expect(result.current).toMatchObject({
      model: "gemini-2.5-pro",
      thinking: "High",
      temperature: 0.5,
      showThoughts: false,
    });

    // Switch to OpenAI - should use defaults
    await act(() => {
      result.current.setProvider("openai");
    });

    expect(result.current).toMatchObject({
      apiKey: "",
      model: "gpt-5.2-2025-12-11",
      thinking: "Default",
      temperature: 1.0,
      showThoughts: true,
    });

    // Configure OpenAI with different settings
    await act(() => {
      result.current.setApiKey("openai-key");
      result.current.setModel("gpt-5-mini-2025-08-07");
      result.current.setThinking("Low");
      result.current.setTemperature(1.5);
      result.current.setShowThoughts(false);
    });

    // Switch back to Gemini - should restore Gemini settings
    await act(() => {
      result.current.setProvider("gemini");
    });

    expect(result.current).toMatchObject({
      apiKey: "gemini-key",
      model: "gemini-2.5-pro",
      thinking: "High",
      temperature: 0.5,
      showThoughts: false,
    });

    // Switch back to OpenAI - should restore OpenAI settings
    await act(() => {
      result.current.setProvider("openai");
    });

    expect(result.current).toMatchObject({
      apiKey: "openai-key",
      model: "gpt-5-mini-2025-08-07",
      thinking: "Low",
      temperature: 1.5,
      showThoughts: false,
    });
  });

  it("saves and loads all provider settings separately", async () => {
    const { result } = renderHook(() => useSettings());

    // Configure each provider with unique settings
    await act(() => {
      result.current.setProvider("gemini");
    });
    await act(() => {
      result.current.setApiKey("gemini-key");
      result.current.setModel("gemini-2.5-pro");
      result.current.setThinking("High");
      result.current.setTemperature(0.5);
    });

    await act(() => {
      result.current.setProvider("openai");
    });
    await act(() => {
      result.current.setApiKey("openai-key");
      result.current.setModel("gpt-5-mini-2025-08-07");
      result.current.setThinking("Low");
      result.current.setTemperature(1.5);
    });

    await act(() => {
      result.current.setProvider("openrouter");
    });
    await act(() => {
      result.current.setApiKey("openrouter-key");
      result.current.setModel("minimax/minimax-m2:free");
      result.current.setTemperature(0.8);
    });

    await act(() => {
      result.current.setProvider("mistral");
    });
    await act(() => {
      result.current.setApiKey("mistral-key");
      result.current.setModel("mistral-small-latest");
      result.current.setTemperature(1.2);
    });

    // Save all settings
    await act(() => {
      result.current.saveSettings();
    });

    // Verify each provider's settings are saved separately as JSON
    expect(
      JSON.parse(localStorage.getItem("producer_pal_provider_gemini") ?? "{}"),
    ).toMatchObject({
      apiKey: "gemini-key",
      model: "gemini-2.5-pro",
      thinking: "High",
      temperature: 0.5,
    });

    expect(
      JSON.parse(localStorage.getItem("producer_pal_provider_openai") ?? "{}"),
    ).toMatchObject({
      apiKey: "openai-key",
      model: "gpt-5-mini-2025-08-07",
      thinking: "Low",
      temperature: 1.5,
    });

    expect(
      JSON.parse(
        localStorage.getItem("producer_pal_provider_openrouter") ?? "{}",
      ),
    ).toMatchObject({
      apiKey: "openrouter-key",
      model: "minimax/minimax-m2:free",
      temperature: 0.8,
    });

    expect(
      JSON.parse(localStorage.getItem("producer_pal_provider_mistral") ?? "{}"),
    ).toMatchObject({
      apiKey: "mistral-key",
      model: "mistral-small-latest",
      temperature: 1.2,
    });

    // Clear and reload
    const { result: result2 } = renderHook(() => useSettings());

    // Verify last selected provider (mistral) is loaded
    expect(result2.current).toMatchObject({
      provider: "mistral",
      apiKey: "mistral-key",
      model: "mistral-small-latest",
      temperature: 1.2,
    });

    // Switch providers and verify each loads correctly
    await act(() => {
      result2.current.setProvider("gemini");
    });
    expect(result2.current).toMatchObject({
      apiKey: "gemini-key",
      model: "gemini-2.5-pro",
      thinking: "High",
      temperature: 0.5,
    });

    await act(() => {
      result2.current.setProvider("openai");
    });
    expect(result2.current).toMatchObject({
      apiKey: "openai-key",
      model: "gpt-5-mini-2025-08-07",
      thinking: "Low",
      temperature: 1.5,
    });

    await act(() => {
      result2.current.setProvider("openrouter");
    });
    expect(result2.current).toMatchObject({
      apiKey: "openrouter-key",
      model: "minimax/minimax-m2:free",
      temperature: 0.8,
    });
  });

  it("settingsConfigured is false by default", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settingsConfigured).toBe(false);
  });

  it("loads settingsConfigured from localStorage", () => {
    localStorage.setItem("producer_pal_settings_configured", "true");
    const { result } = renderHook(() => useSettings());

    expect(result.current.settingsConfigured).toBe(true);
  });

  it("sets settingsConfigured to true after saveSettings is called", async () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settingsConfigured).toBe(false);

    await act(() => {
      result.current.saveSettings();
    });

    expect(result.current.settingsConfigured).toBe(true);
    expect(localStorage.getItem("producer_pal_settings_configured")).toBe(
      "true",
    );
  });

  it("resetBehaviorToDefaults resets temperature, thinking, and showThoughts", async () => {
    const { result } = renderHook(() => useSettings());

    // Set some non-default values
    await act(() => {
      result.current.setTemperature(0.5);
      result.current.setThinking("Low");
      result.current.setShowThoughts(false);
    });

    expect(result.current).toMatchObject({
      temperature: 0.5,
      thinking: "Low",
      showThoughts: false,
    });

    // Reset to defaults
    await act(() => {
      result.current.resetBehaviorToDefaults();
    });

    expect(result.current).toMatchObject({
      temperature: 1.0,
      thinking: "Default", // Default for gemini
      showThoughts: true,
    });
  });

  it("isToolEnabled returns true for enabled tools", () => {
    const { result } = renderHook(() => useSettings());

    // Tools are enabled by default
    expect(result.current.isToolEnabled("ppal-connect")).toBe(true);
  });

  it("isToolEnabled returns false for disabled tools", async () => {
    const { result } = renderHook(() => useSettings());

    // Disable a tool
    await act(() => {
      result.current.setEnabledTools({
        ...result.current.enabledTools,
        "ppal-connect": false,
      });
    });

    expect(result.current.isToolEnabled("ppal-connect")).toBe(false);
  });

  it("isToolEnabled returns true for unknown tools (default)", () => {
    const { result } = renderHook(() => useSettings());

    // Unknown tools default to enabled
    expect(result.current.isToolEnabled("unknown-tool")).toBe(true);
  });

  it("enableAllTools sets all tools to enabled", async () => {
    const { result } = renderHook(() => useSettings());

    // First disable some tools
    await act(() => {
      result.current.setEnabledTools({
        "ppal-connect": false,
        "ppal-read-live-set": false,
      });
    });

    expect(result.current.isToolEnabled("ppal-connect")).toBe(false);

    // Enable all tools
    await act(() => {
      result.current.enableAllTools();
    });

    // All tools should now be enabled
    expect(result.current.isToolEnabled("ppal-connect")).toBe(true);
    expect(result.current.isToolEnabled("ppal-read-live-set")).toBe(true);
  });

  it("disableAllTools sets all tools to disabled", async () => {
    const { result } = renderHook(() => useSettings());

    // Tools start enabled by default
    expect(result.current.isToolEnabled("ppal-connect")).toBe(true);

    // Disable all tools
    await act(() => {
      result.current.disableAllTools();
    });

    // All tools should now be disabled
    expect(result.current.isToolEnabled("ppal-connect")).toBe(false);
    expect(result.current.isToolEnabled("ppal-read-live-set")).toBe(false);
    expect(result.current.isToolEnabled("ppal-create-clip")).toBe(false);
  });

  it("setShowThoughts works for mistral provider", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setProvider("mistral");
    });
    await act(() => {
      result.current.setShowThoughts(false);
    });
    expect(result.current.showThoughts).toBe(false);
  });

  it("setShowThoughts works for openrouter provider", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setProvider("openrouter");
    });
    await act(() => {
      result.current.setShowThoughts(false);
    });
    expect(result.current.showThoughts).toBe(false);
  });

  it.each(["lmstudio", "ollama", "custom"] as const)(
    "setShowThoughts works for %s provider",
    async (provider) => {
      const { result } = renderHook(() => useSettings());

      await act(() => result.current.setProvider(provider));
      await act(() => result.current.setShowThoughts(false));
      expect(result.current.showThoughts).toBe(false);
    },
  );

  it("setProvider preserves thinking value when switching providers", async () => {
    const { result } = renderHook(() => useSettings());

    // Set thinking to "High" for gemini
    await act(() => {
      result.current.setProvider("gemini");
      result.current.setThinking("High");
    });
    expect(result.current.thinking).toBe("High");
    // Switch to OpenAI - thinking should use OpenAI's saved setting (Default by default)
    await act(() => {
      result.current.setProvider("openai");
    });
    expect(result.current.thinking).toBe("Default"); // Default for OpenAI
  });

  it("hasApiKey returns false when localStorage has invalid JSON", async () => {
    // Set invalid JSON for a provider
    localStorage.setItem("producer_pal_provider_gemini", "invalid json{");
    const { result } = renderHook(() => useSettings());

    // Switch to gemini to trigger hasApiKey computation
    await act(() => {
      result.current.setProvider("gemini");
    });
    expect(result.current.hasApiKey).toBe(false);
    // Cleanup
    localStorage.removeItem("producer_pal_provider_gemini");
  });

  it("setBaseUrl updates baseUrl for custom provider", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setProvider("custom");
    });
    await act(() => {
      result.current.setBaseUrl!("http://localhost:8080");
    });

    expect(result.current.baseUrl).toBe("http://localhost:8080");
  });

  it.each([
    ["ollama", "http://192.168.1.100:11434/v1"],
    ["lmstudio", "http://192.168.1.100:1234/v1"],
  ] as const)(
    "setBaseUrl updates baseUrl for %s provider",
    async (provider, url) => {
      const { result } = renderHook(() => useSettings());

      await act(() => result.current.setProvider(provider));
      await act(() => result.current.setBaseUrl!(url));
      expect(result.current.baseUrl).toBe(url);
    },
  );

  it("setBaseUrl is undefined for non-baseUrl providers", () => {
    const { result } = renderHook(() => useSettings());

    // gemini is the default provider - setBaseUrl should be undefined
    expect(result.current.setBaseUrl).toBeUndefined();
    expect(result.current.baseUrl).toBeUndefined();
  });

  it("handles invalid JSON in enabled tools localStorage gracefully", () => {
    localStorage.setItem("producer_pal_enabled_tools", "invalid json{");
    const { result } = renderHook(() => useSettings());

    // Should fallback to defaults, all tools enabled
    expect(result.current.isToolEnabled("ppal-connect")).toBe(true);
    // Cleanup
    localStorage.removeItem("producer_pal_enabled_tools");
  });
});

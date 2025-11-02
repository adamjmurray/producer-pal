/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useSettings } from "./use-settings.js";

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads default values when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.apiKey).toBe("");
    expect(result.current.model).toBe("gemini-2.5-flash");
    expect(result.current.thinking).toBe("Auto");
    expect(result.current.temperature).toBe(1.0);
    expect(result.current.showThoughts).toBe(true);
    expect(result.current.hasApiKey).toBe(false);
  });

  it("migrates Gemini settings from old localStorage format", () => {
    localStorage.setItem("gemini_api_key", "test-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");
    localStorage.setItem("thinking", "High");
    localStorage.setItem("temperature", "0.7");
    localStorage.setItem("showThoughts", "false");

    const { result } = renderHook(() => useSettings());

    expect(result.current.apiKey).toBe("test-key");
    expect(result.current.model).toBe("gemini-2.5-pro");
    expect(result.current.thinking).toBe("High");
    expect(result.current.temperature).toBe(0.7);
    expect(result.current.showThoughts).toBe(false);
    expect(result.current.hasApiKey).toBe(true);
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

    expect(result.current.apiKey).toBe("new-key");
    expect(result.current.model).toBe("gemini-2.5-flash-lite");
    expect(result.current.thinking).toBe("Low");
    expect(result.current.temperature).toBe(1.5);
    expect(result.current.showThoughts).toBe(false);
    expect(result.current.hasApiKey).toBe(true);
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
        thinking: "Auto",
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

    const savedGeminiSettings = JSON.parse(
      localStorage.getItem("producer_pal_provider_gemini") ?? "{}",
    );
    expect(savedGeminiSettings.apiKey).toBe("new-key");
    expect(savedGeminiSettings.model).toBe("gemini-2.5-flash-lite");
    expect(savedGeminiSettings.thinking).toBe("Medium");
    expect(savedGeminiSettings.temperature).toBe(0.8);
    expect(savedGeminiSettings.showThoughts).toBe(false);
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

    expect(result.current.model).toBe("gemini-2.5-pro");
    expect(result.current.thinking).toBe("High");
    expect(result.current.temperature).toBe(0.5);
    expect(result.current.showThoughts).toBe(false);

    // Switch to OpenAI - should use defaults
    await act(() => {
      result.current.setProvider("openai");
    });

    expect(result.current.model).toBe("gpt-5-2025-08-07");
    expect(result.current.thinking).toBe("Auto");
    expect(result.current.temperature).toBe(1.0);
    expect(result.current.showThoughts).toBe(true);
    expect(result.current.apiKey).toBe("");

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

    expect(result.current.apiKey).toBe("gemini-key");
    expect(result.current.model).toBe("gemini-2.5-pro");
    expect(result.current.thinking).toBe("High");
    expect(result.current.temperature).toBe(0.5);
    expect(result.current.showThoughts).toBe(false);

    // Switch back to OpenAI - should restore OpenAI settings
    await act(() => {
      result.current.setProvider("openai");
    });

    expect(result.current.apiKey).toBe("openai-key");
    expect(result.current.model).toBe("gpt-5-mini-2025-08-07");
    expect(result.current.thinking).toBe("Low");
    expect(result.current.temperature).toBe(1.5);
    expect(result.current.showThoughts).toBe(false);
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
    const geminiSettings = JSON.parse(
      localStorage.getItem("producer_pal_provider_gemini") ?? "{}",
    );
    expect(geminiSettings.apiKey).toBe("gemini-key");
    expect(geminiSettings.model).toBe("gemini-2.5-pro");
    expect(geminiSettings.thinking).toBe("High");
    expect(geminiSettings.temperature).toBe(0.5);

    const openaiSettings = JSON.parse(
      localStorage.getItem("producer_pal_provider_openai") ?? "{}",
    );
    expect(openaiSettings.apiKey).toBe("openai-key");
    expect(openaiSettings.model).toBe("gpt-5-mini-2025-08-07");
    expect(openaiSettings.thinking).toBe("Low");
    expect(openaiSettings.temperature).toBe(1.5);

    const openrouterSettings = JSON.parse(
      localStorage.getItem("producer_pal_provider_openrouter") ?? "{}",
    );
    expect(openrouterSettings.apiKey).toBe("openrouter-key");
    expect(openrouterSettings.model).toBe("minimax/minimax-m2:free");
    expect(openrouterSettings.temperature).toBe(0.8);

    const mistralSettings = JSON.parse(
      localStorage.getItem("producer_pal_provider_mistral") ?? "{}",
    );
    expect(mistralSettings.apiKey).toBe("mistral-key");
    expect(mistralSettings.model).toBe("mistral-small-latest");
    expect(mistralSettings.temperature).toBe(1.2);

    // Clear and reload
    const { result: result2 } = renderHook(() => useSettings());

    // Verify last selected provider (mistral) is loaded
    expect(result2.current.provider).toBe("mistral");
    expect(result2.current.apiKey).toBe("mistral-key");
    expect(result2.current.model).toBe("mistral-small-latest");
    expect(result2.current.temperature).toBe(1.2);

    // Switch providers and verify each loads correctly
    await act(() => {
      result2.current.setProvider("gemini");
    });
    expect(result2.current.apiKey).toBe("gemini-key");
    expect(result2.current.model).toBe("gemini-2.5-pro");
    expect(result2.current.thinking).toBe("High");
    expect(result2.current.temperature).toBe(0.5);

    await act(() => {
      result2.current.setProvider("openai");
    });
    expect(result2.current.apiKey).toBe("openai-key");
    expect(result2.current.model).toBe("gpt-5-mini-2025-08-07");
    expect(result2.current.thinking).toBe("Low");
    expect(result2.current.temperature).toBe(1.5);

    await act(() => {
      result2.current.setProvider("openrouter");
    });
    expect(result2.current.apiKey).toBe("openrouter-key");
    expect(result2.current.model).toBe("minimax/minimax-m2:free");
    expect(result2.current.temperature).toBe(0.8);
  });
});

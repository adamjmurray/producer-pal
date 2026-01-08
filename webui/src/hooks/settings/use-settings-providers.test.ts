/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettings } from "./use-settings";

describe("useSettings - provider-specific settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  describe("setThinking for all providers", () => {
    it.each([
      ["mistral", "High"],
      ["openrouter", "Medium"],
      ["lmstudio", "Low"],
      ["ollama", "High"],
      ["custom", "Medium"],
    ] as const)("sets thinking for %s provider", async (provider, thinking) => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider(provider);
      });
      await act(() => {
        result.current.setThinking(thinking);
      });
      expect(result.current.thinking).toBe(thinking);
    });
  });
  describe("setTemperature for all providers", () => {
    it.each([
      ["mistral", 0.8],
      ["openrouter", 0.5],
      ["lmstudio", 0.9],
      ["ollama", 0.7],
      ["custom", 0.6],
    ] as const)("sets temperature for %s provider", async (provider, temp) => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider(provider);
      });
      await act(() => {
        result.current.setTemperature(temp);
      });
      expect(result.current.temperature).toBe(temp);
    });
  });
  describe("setBaseUrl", () => {
    it("sets baseUrl for custom provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("custom");
      });
      await act(() => {
        result.current.setBaseUrl!("https://my-api.com/v1");
      });
      expect(result.current.baseUrl).toBe("https://my-api.com/v1");
    });
    it("setBaseUrl is undefined for non-custom providers", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("openai");
      });
      expect(result.current.setBaseUrl).toBeUndefined();
    });
  });
  describe("setPort", () => {
    it.each([
      ["lmstudio", 5678],
      ["ollama", 9999],
    ] as const)("sets port for %s provider", async (provider, port) => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider(provider);
      });
      await act(() => {
        result.current.setPort!(port);
      });
      expect(result.current.port).toBe(port);
    });
    it("setPort is undefined for non-port-based providers", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("openai");
      });
      expect(result.current.setPort).toBeUndefined();
    });
  });
  describe("setApiKey and setModel for additional providers", () => {
    it.each([
      ["ollama", "ollama-key", "llama2"],
      ["mistral", "mistral-key", "mistral-large"],
      ["openrouter", "openrouter-key", "anthropic/claude-3"],
      ["lmstudio", "lmstudio-key", "local-model"],
      ["custom", "custom-key", "custom-model"],
    ] as const)(
      "sets apiKey and model for %s",
      async (provider, apiKey, model) => {
        const { result } = renderHook(() => useSettings());

        await act(() => {
          result.current.setProvider(provider);
        });
        await act(() => {
          result.current.setApiKey(apiKey);
          result.current.setModel(model);
        });
        expect(result.current.apiKey).toBe(apiKey);
        expect(result.current.model).toBe(model);
      },
    );
  });
});

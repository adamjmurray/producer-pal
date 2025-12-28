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
    it("sets thinking for mistral provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("mistral");
      });
      await act(() => {
        result.current.setThinking("High");
      });
      expect(result.current.thinking).toBe("High");
    });
    it("sets thinking for openrouter provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("openrouter");
      });
      await act(() => {
        result.current.setThinking("Medium");
      });
      expect(result.current.thinking).toBe("Medium");
    });
    it("sets thinking for lmstudio provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("lmstudio");
      });
      await act(() => {
        result.current.setThinking("Low");
      });
      expect(result.current.thinking).toBe("Low");
    });
    it("sets thinking for ollama provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("ollama");
      });
      await act(() => {
        result.current.setThinking("High");
      });
      expect(result.current.thinking).toBe("High");
    });
    it("sets thinking for custom provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("custom");
      });
      await act(() => {
        result.current.setThinking("Medium");
      });
      expect(result.current.thinking).toBe("Medium");
    });
  });
  describe("setTemperature for all providers", () => {
    it("sets temperature for mistral provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("mistral");
      });
      await act(() => {
        result.current.setTemperature(0.8);
      });
      expect(result.current.temperature).toBe(0.8);
    });
    it("sets temperature for openrouter provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("openrouter");
      });
      await act(() => {
        result.current.setTemperature(0.5);
      });
      expect(result.current.temperature).toBe(0.5);
    });
    it("sets temperature for lmstudio provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("lmstudio");
      });
      await act(() => {
        result.current.setTemperature(0.9);
      });
      expect(result.current.temperature).toBe(0.9);
    });
    it("sets temperature for ollama provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("ollama");
      });
      await act(() => {
        result.current.setTemperature(0.7);
      });
      expect(result.current.temperature).toBe(0.7);
    });
    it("sets temperature for custom provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("custom");
      });
      await act(() => {
        result.current.setTemperature(0.6);
      });
      expect(result.current.temperature).toBe(0.6);
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
    it("sets port for lmstudio provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("lmstudio");
      });
      await act(() => {
        result.current.setPort!(5678);
      });
      expect(result.current.port).toBe(5678);
    });
    it("sets port for ollama provider", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setProvider("ollama");
      });
      await act(() => {
        result.current.setPort!(9999);
      });
      expect(result.current.port).toBe(9999);
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

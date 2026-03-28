// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testConnection } from "#webui/utils/test-connection";

describe("testConnection", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function okResponse(): Response {
    return new Response(null, { status: 200 });
  }

  function errorResponse(status: number, statusText: string): Response {
    return new Response(null, { status, statusText });
  }

  describe("validation", () => {
    it("returns error when cloud provider has no API key", async () => {
      const result = await testConnection("anthropic", "");

      expect(result).toStrictEqual({ ok: false, message: "API key required" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns error for all cloud providers without key", async () => {
      for (const provider of [
        "anthropic",
        "gemini",
        "openai",
        "mistral",
        "openrouter",
      ] as const) {
        const result = await testConnection(provider, "");

        expect(result.ok).toBe(false);
        expect(result.message).toBe("API key required");
      }
    });

    it("returns error when custom provider has no base URL", async () => {
      const result = await testConnection("custom", "key");

      expect(result).toStrictEqual({ ok: false, message: "Base URL required" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not require API key for ollama", async () => {
      mockFetch.mockResolvedValue(okResponse());
      const result = await testConnection("ollama", "");

      expect(result.ok).toBe(true);
    });

    it("does not require API key for lmstudio", async () => {
      mockFetch.mockResolvedValue(okResponse());
      const result = await testConnection("lmstudio", "");

      expect(result.ok).toBe(true);
    });
  });

  describe("provider URLs and headers", () => {
    it("uses correct URL and headers for anthropic", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("anthropic", "sk-ant-123");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("https://api.anthropic.com/v1/models");
      expect(options.headers).toStrictEqual({
        "x-api-key": "sk-ant-123",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      });
    });

    it("uses correct URL for gemini with key in query param", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("gemini", "AIza-key");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models?key=AIza-key",
      );
      expect(options.headers).toStrictEqual({});
    });

    it("uses correct URL and headers for openai", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("openai", "sk-openai-123");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("https://api.openai.com/v1/models");
      expect(options.headers).toStrictEqual({
        Authorization: "Bearer sk-openai-123",
      });
    });

    it("uses correct URL and headers for mistral", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("mistral", "mistral-key");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("https://api.mistral.ai/v1/models");
      expect(options.headers).toStrictEqual({
        Authorization: "Bearer mistral-key",
      });
    });

    it("uses auth/key endpoint for openrouter", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("openrouter", "or-key");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("https://openrouter.ai/api/v1/auth/key");
      expect(options.headers).toStrictEqual({ Authorization: "Bearer or-key" });
    });

    it("uses default ollama URL", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("ollama", "");

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("http://localhost:11434/v1/models");
    });

    it("uses custom ollama URL", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("ollama", "", "http://myhost:9999");

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("http://myhost:9999/v1/models");
    });

    it("uses default lmstudio URL", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("lmstudio", "");

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("http://localhost:1234/v1/models");
    });

    it("uses custom base URL for custom provider", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("custom", "my-key", "https://my-api.com/v1");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("https://my-api.com/v1/models");
      expect(options.headers).toStrictEqual({ Authorization: "Bearer my-key" });
    });

    it("sends no auth header for custom provider without key", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("custom", "", "https://my-api.com/v1");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(options.headers).toStrictEqual({});
    });
  });

  describe("response handling", () => {
    it("returns success on 200", async () => {
      mockFetch.mockResolvedValue(okResponse());
      const result = await testConnection("openai", "key");

      expect(result).toStrictEqual({ ok: true, message: "Connected" });
    });

    it("returns invalid API key on 401", async () => {
      mockFetch.mockResolvedValue(errorResponse(401, "Unauthorized"));
      const result = await testConnection("openai", "bad-key");

      expect(result).toStrictEqual({ ok: false, message: "Invalid API key" });
    });

    it("returns invalid API key on 403", async () => {
      mockFetch.mockResolvedValue(errorResponse(403, "Forbidden"));
      const result = await testConnection("openai", "bad-key");

      expect(result).toStrictEqual({ ok: false, message: "Invalid API key" });
    });

    it("returns status on other HTTP errors", async () => {
      mockFetch.mockResolvedValue(errorResponse(500, "Internal Server Error"));
      const result = await testConnection("openai", "key");

      expect(result).toStrictEqual({
        ok: false,
        message: "Error: 500 Internal Server Error",
      });
    });

    it("returns cannot reach server on network error", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const result = await testConnection("openai", "key");

      expect(result).toStrictEqual({
        ok: false,
        message: "Cannot reach server",
      });
    });

    it("returns timeout message on abort", async () => {
      mockFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"));
      const result = await testConnection("openai", "key");

      expect(result).toStrictEqual({
        ok: false,
        message: "Connection timed out",
      });
    });
  });

  describe("abort signal", () => {
    it("passes abort signal to fetch", async () => {
      mockFetch.mockResolvedValue(okResponse());
      await testConnection("openai", "key");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  getBaseUrl,
  isProviderReady,
  LOCAL_PROVIDER_API_KEY,
  normalizeLocalProviderUrl,
  resolveProviderApiKey,
} from "#webui/utils/provider-url";

describe("resolveProviderApiKey", () => {
  it("passes a stored key through", () => {
    expect(resolveProviderApiKey("openai", "sk-1")).toBe("sk-1");
    expect(resolveProviderApiKey("custom", "sk-1", "https://x.test/v1")).toBe(
      "sk-1",
    );
  });

  it.each(["lmstudio", "ollama"])("uses the placeholder for %s", (provider) => {
    expect(resolveProviderApiKey(provider, "")).toBe(LOCAL_PROVIDER_API_KEY);
  });

  it("uses the placeholder for a custom provider with a URL and no key", () => {
    expect(resolveProviderApiKey("custom", "", "https://x.test/v1")).toBe(
      LOCAL_PROVIDER_API_KEY,
    );
  });

  it.each([undefined, "", "   "])(
    "gives a custom provider with URL %j and no key no key",
    (baseUrl) => {
      expect(resolveProviderApiKey("custom", "", baseUrl)).toBe("");
    },
  );

  it("gives a cloud provider with no key no key, even with a URL", () => {
    expect(resolveProviderApiKey("openai", "", "https://x.test/v1")).toBe("");
  });
});

describe("isProviderReady", () => {
  it("is true for a provider with a key", () => {
    expect(isProviderReady("anthropic", "sk-1")).toBe(true);
  });

  it("is false for a cloud provider with no key", () => {
    expect(isProviderReady("anthropic", "")).toBe(false);
  });

  it("is true for local providers with no key", () => {
    expect(isProviderReady("lmstudio", "")).toBe(true);
    expect(isProviderReady("ollama", "")).toBe(true);
  });

  it("is true for custom with a URL and no key", () => {
    expect(isProviderReady("custom", "", "https://x.test/v1")).toBe(true);
  });

  it("is false for custom with an empty URL and no key", () => {
    expect(isProviderReady("custom", "", "")).toBe(false);
  });
});

describe("normalizeLocalProviderUrl", () => {
  it("appends /v1 when missing", () => {
    expect(normalizeLocalProviderUrl("http://localhost:1234")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("does not double-append /v1", () => {
    expect(normalizeLocalProviderUrl("http://localhost:1234/v1")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("strips trailing slashes before appending", () => {
    expect(normalizeLocalProviderUrl("http://localhost:1234/")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizeLocalProviderUrl("http://localhost:1234///")).toBe(
      "http://localhost:1234/v1",
    );
  });
});

describe("getBaseUrl", () => {
  it("returns baseUrl for custom provider", () => {
    expect(getBaseUrl("custom", "https://my-api.com")).toBe(
      "https://my-api.com",
    );
  });

  it("returns undefined for gemini provider", () => {
    expect(getBaseUrl("gemini", undefined)).toBeUndefined();
  });

  it("returns normalized lmstudio URL with default", () => {
    expect(getBaseUrl("lmstudio", undefined)).toBe("http://localhost:1234/v1");
  });

  it("returns normalized lmstudio URL with custom base", () => {
    expect(getBaseUrl("lmstudio", "http://myhost:5555")).toBe(
      "http://myhost:5555/v1",
    );
  });

  it("returns normalized ollama URL with default", () => {
    expect(getBaseUrl("ollama", undefined)).toBe("http://localhost:11434/v1");
  });

  it("returns normalized ollama URL with custom base", () => {
    expect(getBaseUrl("ollama", "http://myhost:9999")).toBe(
      "http://myhost:9999/v1",
    );
  });

  it.each([
    ["lmstudio", "http://localhost:1234/v1"],
    ["ollama", "http://localhost:11434/v1"],
  ])("falls back to the default URL for a blank %s URL", (provider, url) => {
    expect(getBaseUrl(provider, "")).toBe(url);
    expect(getBaseUrl(provider, "  ")).toBe(url);
  });

  it("returns known base URL for openai", () => {
    expect(getBaseUrl("openai", undefined)).toBe("https://api.openai.com/v1");
  });

  it("returns known base URL for mistral", () => {
    expect(getBaseUrl("mistral", undefined)).toBe("https://api.mistral.ai/v1");
  });

  it("returns known base URL for openrouter", () => {
    expect(getBaseUrl("openrouter", undefined)).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("returns undefined for anthropic (not in map)", () => {
    expect(getBaseUrl("anthropic", undefined)).toBeUndefined();
  });
});

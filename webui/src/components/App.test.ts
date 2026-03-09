// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import {
  getBaseUrl,
  isMobile,
  normalizeLocalProviderUrl,
} from "#webui/components/App";

describe("isMobile", () => {
  it("returns true when viewport is below 768px", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);

    expect(isMobile()).toBe(true);
  });

  it("returns false when viewport is at or above 768px", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(isMobile()).toBe(false);
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

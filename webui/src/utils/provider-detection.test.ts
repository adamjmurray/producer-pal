// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";

import { isOpenAIProvider, isOpenRouterProvider } from "./provider-detection";

describe("isOpenAIProvider", () => {
  it("returns true for undefined (default OpenAI)", () => {
    expect(isOpenAIProvider()).toBe(true);
    expect(isOpenAIProvider(undefined)).toBe(true);
  });

  it("returns true for official OpenAI URL", () => {
    expect(isOpenAIProvider("https://api.openai.com/v1")).toBe(true);
  });

  it("returns false for other providers", () => {
    expect(isOpenAIProvider("https://openrouter.ai/api/v1")).toBe(false);
    expect(isOpenAIProvider("https://api.groq.com/openai/v1")).toBe(false);
    expect(isOpenAIProvider("https://api.mistral.ai/v1")).toBe(false);
    expect(isOpenAIProvider("http://localhost:1234/v1")).toBe(false);
  });
});

describe("isOpenRouterProvider", () => {
  it("returns true for OpenRouter URLs", () => {
    expect(isOpenRouterProvider("https://openrouter.ai/api/v1")).toBe(true);
    expect(isOpenRouterProvider("https://api.openrouter.ai/v1")).toBe(true);
  });

  it("returns false for other providers", () => {
    expect(isOpenRouterProvider("https://api.openai.com/v1")).toBe(false);
    expect(isOpenRouterProvider("https://api.groq.com/openai/v1")).toBe(false);
    expect(isOpenRouterProvider("https://api.mistral.ai/v1")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isOpenRouterProvider()).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isOpenRouterProvider("")).toBe(false);
  });
});

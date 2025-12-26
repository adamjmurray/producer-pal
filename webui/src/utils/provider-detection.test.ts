import { describe, expect, it } from "vitest";

import { isOpenRouterProvider } from "./provider-detection";

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
    expect(isOpenRouterProvider(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isOpenRouterProvider("")).toBe(false);
  });
});

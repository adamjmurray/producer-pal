// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createProviderModel } from "#webui/chat/ai-sdk/provider-factories";

// The LanguageModel type is a union — cast to access runtime modelId property
const getModelId = (model: unknown): string =>
  (model as Record<string, unknown>).modelId as string;

describe("createProviderModel", () => {
  it("creates a model for openai provider", () => {
    const model = createProviderModel("openai", "gpt-4o", "test-key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("gpt-4o");
  });

  it("creates a model for openrouter provider", () => {
    const model = createProviderModel("openrouter", "claude-3.5-sonnet", "key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("claude-3.5-sonnet");
  });

  it("creates a model for mistral provider", () => {
    const model = createProviderModel("mistral", "mistral-large", "key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("mistral-large");
  });

  it("creates a model for lmstudio provider with default URL", () => {
    const model = createProviderModel("lmstudio", "local-model", "not-needed");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("local-model");
  });

  it("creates a model for lmstudio provider with custom URL", () => {
    const model = createProviderModel(
      "lmstudio",
      "local-model",
      "not-needed",
      "http://192.168.1.100:1234/v1",
    );

    expect(model).toBeDefined();
  });

  it("creates a model for ollama provider with default URL", () => {
    const model = createProviderModel("ollama", "llama3", "not-needed");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("llama3");
  });

  it("creates a model for ollama provider with custom URL", () => {
    const model = createProviderModel(
      "ollama",
      "llama3",
      "not-needed",
      "http://192.168.1.100:11434/v1",
    );

    expect(model).toBeDefined();
  });

  it("creates a model for custom provider", () => {
    const model = createProviderModel(
      "custom",
      "my-model",
      "key",
      "https://custom.api.com/v1",
    );

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("my-model");
  });

  it("creates a model for gemini provider (placeholder)", () => {
    const model = createProviderModel("gemini", "gemini-2.0-flash", "key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("gemini-2.0-flash");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type LanguageModelV4,
  type SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { cacheVercelModel } from "../vercel-cache.ts";

function stubModel() {
  const doGenerate = vi.fn(async () => ({
    content: [],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {},
    warnings: [],
  }));
  const model = {
    specificationVersion: "v4",
    provider: "gateway",
    modelId: "anthropic/claude-haiku-5.5",
    supportedUrls: {},
    doGenerate,
    doStream: vi.fn(),
  } as unknown as LanguageModelV4;

  return { model, doGenerate };
}

async function sentOptions(
  providerOptions?: SharedV4ProviderOptions,
): Promise<unknown> {
  const { model, doGenerate } = stubModel();
  const wrapped = cacheVercelModel(model) as LanguageModelV4;

  await wrapped.doGenerate({ prompt: [], providerOptions });

  return (
    doGenerate.mock.calls as unknown as Array<[{ providerOptions: unknown }]>
  )[0]?.[0].providerOptions;
}

describe("cacheVercelModel", () => {
  it("turns on gateway auto-caching", async () => {
    expect(await sentOptions()).toStrictEqual({ gateway: { caching: "auto" } });
  });

  it("keeps per-call options such as thinking", async () => {
    expect(await sentOptions({ anthropic: { effort: "high" } })).toStrictEqual({
      gateway: { caching: "auto" },
      anthropic: { effort: "high" },
    });
  });
});

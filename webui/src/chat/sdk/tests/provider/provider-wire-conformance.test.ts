// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { getModelCapabilities } from "@ai-sdk/anthropic/internal";
import { streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderModel } from "#webui/chat/sdk/provider-factories";
import { buildProviderOptions } from "#webui/chat/sdk/provider-options";
import { PROVIDER_MODELS } from "#webui/lib/constants/models";
import { type Provider } from "#webui/types/settings";

// These run the real webui option builders, provider factories and AI SDK
// providers, and stub only `fetch`. The request each provider would receive
// is checked against what that provider accepts, so a field the SDK drops or
// a value the API refuses fails here instead of in front of a user.

const LEVELS = ["Default", "Max", "Off"];

type Body = Record<string, unknown> & {
  thinking?: { type?: string };
  output_config?: { effort?: string };
  reasoning?: { effort?: string };
  generationConfig?: { thinkingConfig?: unknown };
};

/**
 * Model ids the chat UI offers for a provider, minus voice and free text.
 * @param provider - Provider id
 * @returns Preset model ids
 */
function presetModels(provider: Provider): string[] {
  return (PROVIDER_MODELS[provider] ?? [])
    .filter((m) => m.kind !== "realtime" && m.value !== "OTHER")
    .map((m) => m.value);
}

/**
 * Build one request through the real SDK and return its wire body.
 * @param provider - Provider id
 * @param model - Model id
 * @param providerOptions - Options from `buildProviderOptions`
 * @returns The JSON body the provider would have received
 */
async function wireBody(
  provider: Provider,
  model: string,
  providerOptions: ReturnType<typeof buildProviderOptions>,
): Promise<Body> {
  let body: Body = {};

  vi.stubGlobal(
    "fetch",
    vi.fn((_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init?.body as string) as Body;

      return Promise.resolve(new Response("{}", { status: 500 }));
    }),
  );

  const result = streamText({
    model: createProviderModel(provider, model, "test-key"),
    maxRetries: 0,
    messages: [{ role: "user", content: "hi" }],
    providerOptions,
    onError: () => {},
  });

  for await (const part of result.stream) {
    void part;
  }

  return body;
}

describe("provider wire conformance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe.each(presetModels("anthropic"))("anthropic %s", (model) => {
    const caps = getModelCapabilities(model);

    it.each(LEVELS)(
      "sends a thinking type the model accepts (%s)",
      async (level) => {
        const body = await wireBody(
          "anthropic",
          model,
          buildProviderOptions("anthropic", level, model),
        );
        const type = body.thinking?.type;

        expect(caps.isKnownModel).toBe(true);

        if (caps.rejectsThinkingDisabled) {
          expect(type).not.toBe("disabled");
        }

        if (caps.rejectsBudgetThinking) {
          expect(type).not.toBe("enabled");
        }

        if (!caps.supportsBetweenToolsThinking) {
          expect(type).not.toBe("between_tools");
        }
      },
    );

    it("sends adaptive thinking at the Max effort", async () => {
      const body = await wireBody(
        "anthropic",
        model,
        buildProviderOptions("anthropic", "Max", model),
      );

      expect(body.thinking?.type).toBe("adaptive");
      expect(body.output_config?.effort).toBe("max");
    });
  });

  describe.each(presetModels("openai"))("openai %s", (model) => {
    it.each(LEVELS)(
      "keeps the reasoning effort we chose (%s)",
      async (level) => {
        const options = buildProviderOptions("openai", level, model);
        const wanted = options?.openai?.reasoningEffort;
        const body = await wireBody("openai", model, options);

        // The SDK drops an effort the model doesn't list; the model then runs
        // at its default, so "Off" would silently reason at medium.
        expect(body.reasoning?.effort).toBe(wanted);
      },
    );
  });

  describe.each(presetModels("vercel").filter((m) => m.startsWith("openai/")))(
    "vercel %s",
    (model) => {
      it.each(LEVELS)(
        "sends an effort the OpenAI provider keeps (%s)",
        async (level) => {
          const options = buildProviderOptions("vercel", level, model);
          const wanted = options?.openai?.reasoningEffort;
          const body = await wireBody(
            "openai",
            model.slice("openai/".length),
            options,
          );

          expect(body.reasoning?.effort).toBe(wanted);
        },
      );
    },
  );

  describe.each(presetModels("openrouter"))("openrouter %s", (model) => {
    it.each(LEVELS)(
      "keeps the reasoning effort we chose (%s)",
      async (level) => {
        const options = buildProviderOptions("openrouter", level, model);
        const reasoning = options?.openrouter?.reasoning as
          | { effort?: string }
          | undefined;
        const wanted = reasoning?.effort;
        const body = await wireBody("openrouter", model, options);

        expect(body.reasoning?.effort).toBe(wanted);
      },
    );
  });

  describe.each(presetModels("gemini"))("gemini %s", (model) => {
    it.each(LEVELS)(
      "keeps the thinking config we chose (%s)",
      async (level) => {
        const options = buildProviderOptions("gemini", level, model);
        const body = await wireBody("gemini", model, options);

        expect(body.generationConfig?.thinkingConfig).toStrictEqual(
          options?.google?.thinkingConfig,
        );
      },
    );
  });
});

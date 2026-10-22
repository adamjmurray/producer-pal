// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { getModelCapabilities } from "@ai-sdk/anthropic/internal";
import { streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetOpenRouterReasoningCache } from "#webui/chat/sdk/provider/openrouter-reasoning";
import { createProviderModel } from "#webui/chat/sdk/provider/provider-factories";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";
import { isAlwaysOnThinkingModel } from "#webui/hooks/settings/config-builders";
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
  reasoning?: { effort?: string; summary?: string };
  reasoning_effort?: string;
  generationConfig?: { thinkingConfig?: unknown };
};

// Stand-in for OpenRouter's public model list (the Off lookup fetches it).
const OPENROUTER_LIST = {
  data: [
    { id: "anthropic/claude-sonnet-5.5", reasoning: { mandatory: true } },
    { id: "google/gemini-3.8-flash", reasoning: { mandatory: true } },
    {
      id: "deepseek/deepseek-v4.1-flash-1017",
      reasoning: { mandatory: false },
    },
    { id: "moonshotai/kimi-k3", reasoning: { mandatory: false } },
    { id: "qwen/qwen3.8-max-prime", reasoning: { mandatory: true } },
  ],
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
    vi.fn((url: unknown, init?: RequestInit) => {
      if (url === "https://openrouter.ai/api/v1/models") {
        return Promise.resolve(Response.json(OPENROUTER_LIST));
      }

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
  beforeEach(() => {
    resetOpenRouterReasoningCache();
  });

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

    it("asks for the lowest effort, with no thinking field, when Off on an always-on model", async () => {
      const body = await wireBody(
        "anthropic",
        model,
        buildProviderOptions("anthropic", "Off", model),
      );

      if (isAlwaysOnThinkingModel(model)) {
        expect(body.thinking).toBeUndefined();
        expect(body.output_config?.effort).toBe("low");
      } else {
        expect(body.output_config?.effort).toBeUndefined();
      }
    });

    it("sends adaptive thinking at the Default effort", async () => {
      const body = await wireBody(
        "anthropic",
        model,
        buildProviderOptions("anthropic", "Default", model),
      );

      expect(body.thinking?.type).toBe("adaptive");
      expect(body.output_config?.effort).toBe("high");
    });

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

    it("asks for no reasoning summary when Off", async () => {
      const body = await wireBody(
        "openai",
        model,
        buildProviderOptions("openai", "Off", model),
      );

      expect(body.reasoning?.summary).toBeUndefined();
    });
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

  describe.each(
    presetModels("vercel").filter((m) => m.startsWith("anthropic/")),
  )("vercel %s", (model) => {
    it("matches the direct route's effort when Off", async () => {
      const options = buildProviderOptions("vercel", "Off", model);
      const id = model.slice("anthropic/".length);
      const direct = await wireBody(
        "anthropic",
        id,
        buildProviderOptions("anthropic", "Off", id),
      );
      const effort = (options?.anthropic as { effort?: string } | undefined)
        ?.effort;

      expect(effort).toBe(direct.output_config?.effort);
    });
  });

  describe.each(presetModels("openrouter"))("openrouter %s", (model) => {
    it.each(["Default", "Max"])(
      "keeps the reasoning effort we chose (%s)",
      async (level) => {
        const options = buildProviderOptions("openrouter", level, model);
        const reasoning = options?.openrouter?.reasoning as
          | { effort?: string }
          | undefined;
        const body = await wireBody("openrouter", model, options);

        expect(body.reasoning?.effort).toBe(reasoning?.effort);
      },
    );
  });

  describe.each([
    ["deepseek/deepseek-v4.1-flash-1017", "none"],
    ["moonshotai/kimi-k3", "none"],
    ["anthropic/claude-sonnet-5.5", "low"],
    ["google/gemini-3.8-flash", "low"],
    ["qwen/qwen3.8-max-prime", "low"],
    ["qwen/qwen3.8-max", undefined],
  ])("openrouter Off for %s", (model, effort) => {
    it("sends the effort the model accepts, or none for an unlisted model", async () => {
      const body = await wireBody(
        "openrouter",
        model,
        buildProviderOptions("openrouter", "Off", model),
      );

      expect(body.reasoning?.effort).toBe(effort);
    });
  });

  describe.each(presetModels("ollama"))("ollama %s", (model) => {
    it.each([
      ["Default", undefined],
      ["Max", undefined],
      ["Off", "none"],
    ])("sends reasoning_effort for %s", async (level, effort) => {
      const body = await wireBody(
        "ollama",
        model,
        buildProviderOptions("ollama", level, model),
      );

      expect(body.reasoning_effort).toBe(effort);
    });
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

  describe.each([
    ["gemini-3.8-flash", { thinkingLevel: "low" }],
    ["gemini-4-argon", { thinkingLevel: "low" }],
    ["gemini-3.5-flash-lite", { thinkingLevel: "low" }],
    ["gemini-2.5-flash", { thinkingBudget: 0 }],
    ["gemini-2.5-flash-lite", { thinkingBudget: 0 }],
    ["gemini-2.5-pro", undefined],
  ])("gemini Off for %s", (model, thinkingConfig) => {
    it("sends the config the model accepts", async () => {
      const body = await wireBody(
        "gemini",
        model,
        buildProviderOptions("gemini", "Off", model),
      );

      expect(body.generationConfig?.thinkingConfig).toStrictEqual(
        thinkingConfig,
      );
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetOpenRouterReasoningCache } from "#webui/chat/sdk/provider/openrouter-reasoning.ts";
import { buildProviderOptions } from "#evals/chat/thinking-provider-options.ts";
import { cacheOpenRouterRequest } from "../openrouter-cache.ts";

const MODELS = {
  data: [
    { id: "deepseek/deepseek-v4.1-flash", reasoning: { mandatory: false } },
    { id: "acme/always-thinks", reasoning: { mandatory: true } },
  ],
};

describe("OpenRouter --thinking off request body", () => {
  let chatBodies: string[];

  /**
   * Stub fetch: the model list gets `models`, chat requests are recorded.
   *
   * @param models - Response for OpenRouter's model list
   */
  function stubFetch(models: () => Response): void {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        if ((input as string).endsWith("/models")) {
          return models();
        }

        chatBodies.push(init?.body as string);

        return new Response("{}");
      }),
    );
  }

  beforeEach(() => {
    resetOpenRouterReasoningCache();
    chatBodies = [];
    stubFetch(() => Response.json(MODELS));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Send the body the SDK would build for `--thinking off` on a model.
   *
   * @param model - OpenRouter model id
   * @returns The reasoning field that went out on the wire
   */
  async function sentReasoning(model: string): Promise<unknown> {
    const options = buildProviderOptions("openrouter", "off", model);
    const body = { model, ...(options?.openrouter as object), messages: [] };

    await cacheOpenRouterRequest(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return (JSON.parse(chatBodies[0] as string) as { reasoning?: unknown })
      .reasoning;
  }

  it("sends effort none to a model that can turn reasoning off", async () => {
    expect(await sentReasoning("deepseek/deepseek-v4.1-flash")).toStrictEqual({
      effort: "none",
    });
  });

  it("raises it to low for a mandatory-reasoning model, which 400s on none", async () => {
    expect(await sentReasoning("acme/always-thinks")).toStrictEqual({
      effort: "low",
    });
  });

  it("drops it for a model OpenRouter doesn't list", async () => {
    expect(await sentReasoning("acme/unlisted")).toBeUndefined();
  });

  it("drops it when the model list can't be fetched", async () => {
    stubFetch(() => new Response("nope", { status: 500 }));

    expect(await sentReasoning("acme/always-thinks")).toBeUndefined();
  });
});

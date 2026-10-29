// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dropUnusableClaudeReasoning,
  resetOpenRouterReasoningCache,
} from "#webui/chat/sdk/provider/openrouter-reasoning";
import { transformOpenRouterRequest } from "#webui/chat/sdk/provider/provider-factories";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";

const CLAUDE = { type: "reasoning.text", format: "anthropic-claude-v1" };
const GEMINI = { type: "reasoning.encrypted", format: "google-gemini-v1" };

const LIST = {
  data: [
    { id: "anthropic/claude-sonnet-5.5", reasoning: { mandatory: true } },
    { id: "anthropic/claude-haiku-5.5", reasoning: { mandatory: false } },
    { id: "openai/gpt-6.1-terra", reasoning: { mandatory: false } },
  ],
};

type Msg = {
  role: string;
  reasoning?: string;
  reasoning_details?: Array<{ format?: string }>;
};
type Body = {
  model?: string;
  reasoning?: { effort?: string };
  messages?: Msg[];
};

/**
 * A request body with one earlier assistant step that carries `details`.
 * @param model - Request model
 * @param reasoning - Body reasoning field
 * @param details - The earlier step's reasoning_details
 * @returns The body
 */
function bodyWith(
  model: string,
  reasoning: Body["reasoning"],
  details: Array<{ format?: string }> = [CLAUDE],
): Body {
  return {
    model,
    ...(reasoning ? { reasoning } : {}),
    messages: [
      { role: "user" },
      { role: "assistant", reasoning: "hm", reasoning_details: details },
      { role: "user" },
    ],
  };
}

describe("dropUnusableClaudeReasoning", () => {
  it("keeps Claude's reasoning when the body reasons on a Claude model", () => {
    const body = bodyWith("anthropic/claude-sonnet-5.5", { effort: "medium" });

    expect(dropUnusableClaudeReasoning(body)).toBe(false);
    expect(body.messages![1]!.reasoning_details).toStrictEqual([CLAUDE]);
  });

  it.each([
    ["no reasoning", undefined, "anthropic/claude-sonnet-5.5"],
    ["effort none", { effort: "none" }, "anthropic/claude-sonnet-5.5"],
    ["a non-Claude model", { effort: "high" }, "openai/gpt-6.1-terra"],
  ])("drops it for %s", (_name, reasoning, model) => {
    const body = bodyWith(model, reasoning);

    expect(dropUnusableClaudeReasoning(body)).toBe(true);
    expect(body.messages![1]).toStrictEqual({ role: "assistant" });
  });

  it("drops it when the body has no model", () => {
    const body = bodyWith("x", { effort: "high" });

    delete body.model;

    expect(dropUnusableClaudeReasoning(body)).toBe(true);
  });

  it("leaves another model's reasoning_details alone", () => {
    const body = bodyWith("openai/gpt-6.1-terra", { effort: "none" }, [GEMINI]);

    expect(dropUnusableClaudeReasoning(body)).toBe(false);
    expect(body.messages![1]!.reasoning_details).toStrictEqual([GEMINI]);
  });

  it("takes only the Claude entries out of a mixed list", () => {
    const body = bodyWith("openai/gpt-6.1-terra", { effort: "high" }, [
      CLAUDE,
      GEMINI,
    ]);

    expect(dropUnusableClaudeReasoning(body)).toBe(true);
    expect(body.messages![1]).toStrictEqual({
      role: "assistant",
      reasoning: "hm",
      reasoning_details: [GEMINI],
    });
  });

  it("ignores messages without a details list and bodies without messages", () => {
    const body: Body = { model: "x", messages: [{ role: "user" }] };

    expect(dropUnusableClaudeReasoning(body)).toBe(false);
    expect(dropUnusableClaudeReasoning({ model: "x" })).toBe(false);
  });
});

describe("the OpenRouter request rewrite at every thinking level", () => {
  let sent: Body;

  beforeEach(() => {
    resetOpenRouterReasoningCache();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown, init?: RequestInit) => {
        if (url === "https://openrouter.ai/api/v1/models") {
          return Promise.resolve(Response.json(LIST));
        }

        sent = JSON.parse(init?.body as string) as Body;

        return Promise.resolve(new Response("{}"));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Run a body shaped like the SDK's for this level through the rewrite.
   * @param model - Request model
   * @param level - UI thinking level
   * @returns The assistant message that went out
   */
  async function assistantSentAt(model: string, level: string): Promise<Msg> {
    const options = buildProviderOptions("openrouter", level, model) as {
      openrouter: { reasoning: { effort: string } };
    };

    await transformOpenRouterRequest("https://openrouter.ai/api/v1/chat", {
      body: JSON.stringify(bodyWith(model, options.openrouter.reasoning)),
    });

    return sent.messages![1]!;
  }

  it.each(["Default", "Max"])(
    "keeps Claude's reasoning at %s",
    async (level) => {
      const assistant = await assistantSentAt(
        "anthropic/claude-sonnet-5.5",
        level,
      );

      expect(assistant.reasoning_details).toStrictEqual([CLAUDE]);
    },
  );

  it("keeps it at Off on a model that can't turn reasoning off", async () => {
    const assistant = await assistantSentAt(
      "anthropic/claude-sonnet-5.5",
      "Off",
    );

    expect(assistant.reasoning_details).toStrictEqual([CLAUDE]);
  });

  it("drops it at Off on a Claude model that can turn reasoning off", async () => {
    const assistant = await assistantSentAt(
      "anthropic/claude-haiku-5.5",
      "Off",
    );

    expect(assistant).toStrictEqual({ role: "assistant" });
  });

  it.each(["Default", "Max", "Off"])(
    "drops it at %s on a non-Claude model",
    async (level) => {
      const assistant = await assistantSentAt("openai/gpt-6.1-terra", level);

      expect(assistant).toStrictEqual({ role: "assistant" });
    },
  );
});

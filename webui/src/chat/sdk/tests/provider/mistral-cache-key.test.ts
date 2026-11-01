// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, streamText: vi.fn(), generateText: vi.fn() };
});

vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({
    tools: {},
    mcpClient: { close: vi.fn().mockResolvedValue(undefined) },
  }),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
  getSubagentBriefingUrl: vi.fn(
    () => "http://localhost:3000/subagent-briefing",
  ),
}));

vi.mock(
  import("#webui/chat/sdk/subagent/subagent-briefing"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      fetchSubagentBriefing: vi.fn().mockResolvedValue(null),
    };
  },
);

import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  createConfig,
  mockStreamParts,
} from "#webui/chat/sdk/tests/client-test-helpers";
import {
  runTurn,
  spawnToolExecute,
  streamTextMock,
} from "#webui/chat/sdk/tests/client/subagent-test-helpers";
import { type ChatClientConfig } from "#webui/chat/sdk/types";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";

const mistralModel = {
  modelId: "mistral-large-latest",
  provider: "mistral.chat",
  specificationVersion: "v3",
} as never;

/**
 * Config for a model with the given `provider` string.
 * @param provider - The model's provider field
 * @param overrides - Config overrides
 * @returns Mock ChatClientConfig
 */
function configFor(
  provider: string,
  overrides?: Partial<ChatClientConfig>,
): ChatClientConfig {
  return createConfig({
    model: { modelId: "mistral-large-latest", provider } as never,
    ...overrides,
  });
}

/**
 * The providerOptions of the most recent streamText call.
 * @returns The options, or undefined when none were sent
 */
function lastProviderOptions():
  | Record<string, Record<string, unknown>>
  | undefined {
  const call = streamTextMock.mock.calls.at(-1)?.[0] as {
    providerOptions?: Record<string, Record<string, unknown>>;
  };

  return call.providerOptions;
}

/**
 * Run one turn and return the Mistral prompt-cache key it sent.
 * @param client - The client to drive
 * @param overrides - Per-message overrides
 * @returns The key, or undefined when no key was sent
 */
async function sentKey(
  client: ChatSdkClient,
  overrides?: { thinking: string },
): Promise<unknown> {
  mockStreamParts([{ type: "finish", finishReason: "stop" }]);

  for await (const _ of client.sendMessage("hi", undefined, overrides)) {
    /* consume */
  }

  return lastProviderOptions()?.mistral?.promptCacheKey;
}

describe("Mistral prompt cache key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a key and keeps existing mistral options", async () => {
    const client = new ChatSdkClient(
      "key",
      configFor("mistral.chat", {
        providerOptions: { mistral: { reasoningEffort: "high" } },
      }),
    );

    expect(await sentKey(client)).toStrictEqual(expect.any(String));
    expect(lastProviderOptions()?.mistral).toStrictEqual({
      reasoningEffort: "high",
      promptCacheKey: expect.any(String),
    });
  });

  it("keeps other providers' options", async () => {
    const client = new ChatSdkClient(
      "key",
      configFor("mistral.chat", {
        providerOptions: { openai: { reasoningEffort: "low" } },
      }),
    );

    await sentKey(client);

    expect(lastProviderOptions()?.openai).toStrictEqual({
      reasoningEffort: "low",
    });
  });

  it("sends the same key on every request, thinking override included", async () => {
    const buildProviderOptions = vi.fn(() => ({
      mistral: { reasoningEffort: "high" },
    }));
    const client = new ChatSdkClient(
      "key",
      configFor("mistral.chat", {
        providerOptions: { mistral: { reasoningEffort: "none" } },
        buildProviderOptions,
      }),
    );

    const first = await sentKey(client);
    const overridden = await sentKey(client, { thinking: "High" });

    expect(buildProviderOptions).toHaveBeenCalledTimes(1);
    expect(lastProviderOptions()?.mistral?.reasoningEffort).toBe("high");
    expect(first).toStrictEqual(expect.any(String));
    expect(overridden).toBe(first);
    expect(await sentKey(client)).toBe(first);
  });

  it("sends a key on a resumed turn", async () => {
    const client = new ChatSdkClient("key", configFor("mistral.chat"));
    const first = await sentKey(client);

    mockStreamParts([{ type: "finish", finishReason: "stop" }]);

    for await (const _ of client.resumeStream()) {
      /* consume */
    }

    expect(lastProviderOptions()?.mistral?.promptCacheKey).toBe(first);
  });

  it("gives each client its own key", async () => {
    const config = configFor("mistral.chat");
    const a = await sentKey(new ChatSdkClient("key", config));
    const b = await sentKey(new ChatSdkClient("key", config));

    expect(a).not.toBe(b);
  });

  it("gives a subagent worker its own key", async () => {
    const client = new ChatSdkClient(
      "key",
      createConfig({
        model: mistralModel,
        enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true },
      }),
    );

    await client.initialize();
    await runTurn(client);

    const orchestratorKey = lastProviderOptions()?.mistral?.promptCacheKey;

    mockStreamParts([
      { type: "text-delta", text: "done" },
      { type: "finish", finishReason: "stop" },
    ]);
    await spawnToolExecute()(
      { task: "x" },
      { toolCallId: "t1", messages: [], abortSignal: undefined },
    );

    const workerKey = lastProviderOptions()?.mistral?.promptCacheKey;

    expect(orchestratorKey).toStrictEqual(expect.any(String));
    expect(workerKey).toStrictEqual(expect.any(String));
    expect(workerKey).not.toBe(orchestratorKey);
  });

  it.each(["openrouter.chat", "gateway", "openai.chat", "custom.chat"])(
    "sends no key through %s",
    async (provider) => {
      const client = new ChatSdkClient("key", configFor(provider));

      expect(await sentKey(client)).toBeUndefined();
    },
  );

  it("sends no key for a string (gateway) model", async () => {
    const client = new ChatSdkClient(
      "key",
      createConfig({
        model: "mistral/mistral-large-latest",
        providerOptions: { gateway: { order: ["mistral"] } },
      }),
    );

    expect(await sentKey(client)).toBeUndefined();
    expect(lastProviderOptions()).toStrictEqual({
      gateway: { order: ["mistral"] },
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { type AnthropicRequestBody } from "#webui/chat/sdk/provider/anthropic-cache-control.ts";
import {
  cacheAnthropicRequest,
  markConnectResult,
} from "../anthropic-cache.ts";

const EPHEMERAL = { type: "ephemeral" };

function toolResult(text: string) {
  return { type: "tool_result", tool_use_id: "t1", content: text };
}

function scenarioBody(): AnthropicRequestBody {
  return {
    system: "instructions",
    tools: [{ name: "ppal-connect" }],
    messages: [
      { role: "user", content: "Connect to Ableton Live" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "ppal-connect" }],
      },
      { role: "user", content: [toolResult("skills")] },
      { role: "assistant", content: "Connected." },
      { role: "user", content: "make a clip" },
    ],
  };
}

describe("markConnectResult", () => {
  it("marks the first tool result, which holds the connect result", () => {
    const body = scenarioBody();

    expect(markConnectResult(body)).toBe(true);
    expect(body.messages?.[2]?.content).toStrictEqual([
      { ...toolResult("skills"), cache_control: EPHEMERAL },
    ]);
  });

  it("leaves it to the tail breakpoint when the connect result is last", () => {
    const body = scenarioBody();

    body.messages = body.messages?.slice(0, 3);

    expect(markConnectResult(body)).toBe(false);
  });

  it("does nothing before any tool has run", () => {
    expect(
      markConnectResult({ messages: [{ role: "user", content: "hi" }] }),
    ).toBe(false);
    expect(markConnectResult({})).toBe(false);
  });
});

// Returns the body that reached fetch.
async function sendThroughCache(body: object): Promise<AnthropicRequestBody> {
  const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}"));

  vi.stubGlobal("fetch", fetchSpy);

  await cacheAnthropicRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return JSON.parse(
    fetchSpy.mock.calls[0]?.[1]?.body as string,
  ) as AnthropicRequestBody;
}

describe("cacheAnthropicRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the head, connect, and tail breakpoints", async () => {
    const sent = await sendThroughCache(scenarioBody());
    const marks = JSON.stringify(sent).split('"cache_control"').length - 1;

    expect(marks).toBe(3);
    expect(sent.system).toStrictEqual([
      { type: "text", text: "instructions", cache_control: EPHEMERAL },
    ]);
    expect(sent.messages?.at(-1)?.content).toStrictEqual([
      { type: "text", text: "make a clip", cache_control: EPHEMERAL },
    ]);
  });

  it("asks for summarized thinking on adaptive requests", async () => {
    const sent = await sendThroughCache({
      ...scenarioBody(),
      thinking: { type: "adaptive" },
    });

    expect(sent.thinking).toStrictEqual({
      type: "adaptive",
      display: "summarized",
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { type OpenRouterRequestBody } from "#webui/chat/sdk/provider/openrouter-cache-control.ts";
import {
  cacheOpenRouterRequest,
  markOpenRouterConnectResult,
} from "../openrouter-cache.ts";

const EPHEMERAL = { type: "ephemeral" };

function scenarioBody(
  model = "anthropic/claude-haiku-5.5",
): OpenRouterRequestBody {
  return {
    model,
    messages: [
      { role: "system", content: "instructions" },
      { role: "user", content: "Connect to Ableton Live" },
      { role: "assistant", content: "" },
      { role: "tool", content: "skills" },
      { role: "assistant", content: "Connected." },
      { role: "user", content: "make a clip" },
    ],
  };
}

describe("markOpenRouterConnectResult", () => {
  it("marks the first tool message on Claude models", () => {
    const body = scenarioBody();

    expect(markOpenRouterConnectResult(body)).toBe(true);
    expect(body.messages?.[3]?.content).toStrictEqual([
      { type: "text", text: "skills", cache_control: EPHEMERAL },
    ]);
  });

  it("skips Gemini, which caches on the tail alone", () => {
    expect(markOpenRouterConnectResult(scenarioBody("google/gemini-3"))).toBe(
      false,
    );
  });

  it("leaves it to the tail breakpoint when the connect result is last", () => {
    const body = scenarioBody();

    body.messages = body.messages?.slice(0, 4);

    expect(markOpenRouterConnectResult(body)).toBe(false);
  });

  it("does nothing before any tool has run", () => {
    expect(
      markOpenRouterConnectResult({
        model: "anthropic/claude-haiku-5.5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).toBe(false);
    expect(markOpenRouterConnectResult({})).toBe(false);
  });
});

describe("cacheOpenRouterRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function send(body: OpenRouterRequestBody): Promise<string> {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}"));

    vi.stubGlobal("fetch", fetchSpy);

    await cacheOpenRouterRequest(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return fetchSpy.mock.calls[0]?.[1]?.body as string;
  }

  it("sends the system, connect, and tail breakpoints for Claude", async () => {
    const sentBody = await send(scenarioBody());
    const sent = JSON.parse(sentBody) as OpenRouterRequestBody;

    expect(sentBody.split('"cache_control"').length - 1).toBe(3);
    expect(sent.messages?.map((m) => JSON.stringify(m.content))).toStrictEqual([
      JSON.stringify([
        { type: "text", text: "instructions", cache_control: EPHEMERAL },
      ]),
      '"Connect to Ableton Live"',
      '""',
      JSON.stringify([
        { type: "text", text: "skills", cache_control: EPHEMERAL },
      ]),
      '"Connected."',
      JSON.stringify([
        { type: "text", text: "make a clip", cache_control: EPHEMERAL },
      ]),
    ]);
  });

  it("marks only system and tail for Gemini", async () => {
    const sentBody = await send(scenarioBody("google/gemini-3"));

    expect(sentBody.split('"cache_control"').length - 1).toBe(2);
  });

  it("leaves other models untouched", async () => {
    const body = scenarioBody("openai/gpt-5");

    expect(await send(body)).toBe(JSON.stringify(body));
  });
});

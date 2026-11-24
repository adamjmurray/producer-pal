// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetOllamaThinkingCache,
  settleOllamaThinking,
} from "#webui/chat/sdk/provider/local-model/ollama-thinking";
import { rewritingFetch } from "#webui/chat/sdk/provider/rewriting-fetch";

const ROOT = "http://localhost:11434";
const CHAT_URL = `${ROOT}/v1/chat/completions`;

type Show = { capabilities?: unknown } | "http-error" | "network-error";

/**
 * Stub the global fetch: `/api/show` answers with `show`, anything else is the
 * chat request.
 * @param show - What `/api/show` answers
 * @returns The fetch mock
 */
function stubFetch(show: Show): ReturnType<typeof vi.fn> {
  const mock = vi.fn((input: string | URL) => {
    if (!String(input).endsWith("/api/show")) {
      return Promise.resolve(new Response("{}"));
    }

    if (show === "network-error") {
      return Promise.reject(new Error("offline"));
    }

    return Promise.resolve(
      show === "http-error"
        ? new Response("not found", { status: 404 })
        : new Response(JSON.stringify(show)),
    );
  });

  vi.stubGlobal("fetch", mock);

  return mock;
}

/**
 * Send a chat body through the fetch and return what went out.
 * @param mock - The fetch mock
 * @param unknown - What to do when the server can't say
 * @param body - Chat request body
 * @param root - The server's root URL
 * @returns The chat body as sent
 */
async function send(
  mock: ReturnType<typeof vi.fn>,
  unknown: "keep" | "drop",
  body: Record<string, unknown>,
  root = ROOT,
): Promise<Record<string, unknown>> {
  await rewritingFetch((parsed) => settleOllamaThinking(parsed, root, unknown))(
    CHAT_URL,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  const chat = mock.mock.calls.findLast(([url]) => url === CHAT_URL);
  const init = chat?.[1] as { body: string } | undefined;

  return JSON.parse(init?.body ?? "") as Record<string, unknown>;
}

describe("settleOllamaThinking", () => {
  beforeEach(() => {
    resetOllamaThinkingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the effort for a model that thinks", async () => {
    const mock = stubFetch({ capabilities: ["completion", "thinking"] });
    const sent = await send(mock, "drop", {
      model: "qwen3.8",
      reasoning_effort: "high",
    });

    expect(sent.reasoning_effort).toBe("high");
    expect(mock.mock.calls[0]?.[0]).toBe("http://localhost:11434/api/show");
  });

  // Behind a proxy the server's API sits under the same prefix as chat.
  it.each(["https://host/ollama", "https://host/a/b"])(
    "asks %s for /api/show under its path prefix",
    async (root) => {
      const mock = stubFetch({ capabilities: ["thinking"] });
      const sent = await send(
        mock,
        "drop",
        { model: "m", reasoning_effort: "high" },
        root,
      );

      expect(sent.reasoning_effort).toBe("high");
      expect(mock.mock.calls[0]?.[0]).toBe(`${root}/api/show`);
    },
  );

  it("drops the effort for a model that can't think", async () => {
    const mock = stubFetch({ capabilities: ["completion", "tools"] });
    const sent = await send(mock, "keep", {
      model: "mistral-small3.2",
      reasoning_effort: "high",
    });

    expect(sent).toStrictEqual({ model: "mistral-small3.2" });
  });

  it("doesn't ask about none or a missing effort", async () => {
    const mock = stubFetch({ capabilities: ["completion"] });

    expect(
      await send(mock, "drop", { model: "m", reasoning_effort: "none" }),
    ).toStrictEqual({ model: "m", reasoning_effort: "none" });
    expect(await send(mock, "drop", { model: "m" })).toStrictEqual({
      model: "m",
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each(["http-error", "network-error", {}] as const)(
    "follows `unknown` when the server doesn't say (%j)",
    async (show) => {
      const body = { model: "m", reasoning_effort: "high" };

      expect(await send(stubFetch(show), "keep", body)).toStrictEqual(body);

      resetOllamaThinkingCache();

      expect(await send(stubFetch(show), "drop", body)).toStrictEqual({
        model: "m",
      });
    },
  );

  it("drops the effort when the body names no model", async () => {
    const mock = stubFetch({ capabilities: ["thinking"] });

    expect(
      await send(mock, "drop", { reasoning_effort: "high" }),
    ).toStrictEqual({});
  });

  it("asks once per model", async () => {
    const body = { model: "m", reasoning_effort: "high" };
    const mock = stubFetch({ capabilities: ["thinking"] });

    await send(mock, "drop", body);
    await send(mock, "drop", body);

    expect(mock).toHaveBeenCalledTimes(3);
  });

  it.each(["http-error", "network-error"] as const)(
    "asks again after a failed lookup (%s)",
    async (show) => {
      const body = { model: "m", reasoning_effort: "high" };
      const failing = stubFetch(show);

      await send(failing, "drop", body);
      await send(failing, "drop", body);

      expect(failing).toHaveBeenCalledTimes(4);
    },
  );
});

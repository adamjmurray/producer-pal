// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  resetOpenRouterReasoningCache,
  settleOpenRouterReasoningOff,
} from "#webui/chat/sdk/provider/openrouter-reasoning";

const LIST = {
  data: [
    { id: "anthropic/claude-sonnet-5.5", reasoning: { mandatory: true } },
    { id: "deepseek/deepseek-v4.1-flash", reasoning: { mandatory: false } },
    { id: "mistralai/mistral-large-4-0" },
    { id: 7, reasoning: { mandatory: true } },
  ],
};

type Body = { model?: string; reasoning?: { effort?: string } };

/**
 * A request body as the OpenRouter SDK builds it for Off.
 * @param model - Model id
 * @param effort - Reasoning effort on the body
 * @returns The body
 */
function offBody(model: string, effort = "none"): Body {
  return { model, reasoning: { effort } };
}

describe("settleOpenRouterReasoningOff", () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    resetOpenRouterReasoningCache();
    fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(LIST)));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps none for a model that can turn reasoning off", async () => {
    const body = offBody("deepseek/deepseek-v4.1-flash");

    expect(await settleOpenRouterReasoningOff(body)).toBe(false);
    expect(body.reasoning).toStrictEqual({ effort: "none" });
  });

  it("raises none to low for a model with mandatory reasoning", async () => {
    const body = offBody("anthropic/claude-sonnet-5.5");

    expect(await settleOpenRouterReasoningOff(body)).toBe(true);
    expect(body.reasoning).toStrictEqual({ effort: "low" });
  });

  it.each(["qwen/qwen3.8-max", "mistralai/mistral-large-4-0"])(
    "drops reasoning for a model the list doesn't describe (%s)",
    async (model) => {
      const body = offBody(model);

      expect(await settleOpenRouterReasoningOff(body)).toBe(true);
      expect(body.reasoning).toBeUndefined();
    },
  );

  it("leaves other efforts and bodies without a model alone", async () => {
    const medium = offBody("anthropic/claude-sonnet-5.5", "medium");
    const noModel: Body = { reasoning: { effort: "none" } };
    const noReasoning: Body = { model: "anthropic/claude-sonnet-5.5" };

    expect(await settleOpenRouterReasoningOff(medium)).toBe(false);
    expect(await settleOpenRouterReasoningOff(noModel)).toBe(false);
    expect(await settleOpenRouterReasoningOff(noReasoning)).toBe(false);
    expect(medium.reasoning).toStrictEqual({ effort: "medium" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares one fetch between concurrent and later calls", async () => {
    await Promise.all([
      settleOpenRouterReasoningOff(offBody("anthropic/claude-sonnet-5.5")),
      settleOpenRouterReasoningOff(offBody("deepseek/deepseek-v4.1-flash")),
      settleOpenRouterReasoningOff(offBody("qwen/qwen3.8-max")),
    ]);
    await settleOpenRouterReasoningOff(offBody("anthropic/claude-sonnet-5.5"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://openrouter.ai/api/v1/models",
    );
  });

  it("drops reasoning when the fetch fails, and retries on a later call", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    const first = offBody("anthropic/claude-sonnet-5.5");

    await settleOpenRouterReasoningOff(first);
    expect(first.reasoning).toBeUndefined();

    const second = offBody("anthropic/claude-sonnet-5.5");

    await settleOpenRouterReasoningOff(second);
    expect(second.reasoning).toStrictEqual({ effort: "low" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops reasoning on an HTTP error and retries later", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 503 }));

    const body = offBody("deepseek/deepseek-v4.1-flash");

    await settleOpenRouterReasoningOff(body);
    expect(body.reasoning).toBeUndefined();

    await settleOpenRouterReasoningOff(offBody("deepseek/deepseek-v4.1-flash"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["not JSON", new Response("<html>", { status: 200 })],
    ["no data array", Response.json({ data: "x" })],
  ])(
    "drops reasoning on a malformed response (%s)",
    async (_name, response) => {
      fetchMock.mockResolvedValueOnce(response);

      const body = offBody("deepseek/deepseek-v4.1-flash");

      await settleOpenRouterReasoningOff(body);
      expect(body.reasoning).toBeUndefined();
    },
  );

  it("gives up after the timeout and retries on a later call", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const slow = offBody("anthropic/claude-sonnet-5.5");
    const settled = settleOpenRouterReasoningOff(slow);

    await vi.advanceTimersByTimeAsync(3000);
    await settled;
    expect(slow.reasoning).toBeUndefined();

    const next = offBody("anthropic/claude-sonnet-5.5");

    await settleOpenRouterReasoningOff(next);
    expect(next.reasoning).toStrictEqual({ effort: "low" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

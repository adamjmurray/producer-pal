// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { useProxyFixture } from "./local-model-proxy-test-helpers.ts";

// Node always sets a status on a response it received; the proxy still has to
// answer something if one arrives without. Strip it from upstream responses.
vi.mock(import("node:http"), async (importOriginal) => {
  const actual = await importOriginal();
  const request = ((...args: Parameters<typeof actual.request>) => {
    const upstream = actual.request(...args);
    const on = upstream.on.bind(upstream);

    upstream.on = ((event: string, listener: (...a: unknown[]) => void) =>
      event === "response"
        ? on(event, (res: IncomingMessage) => {
            Object.defineProperty(res, "statusCode", { value: undefined });
            listener(res);
          })
        : on(event, listener)) as typeof upstream.on;

    return upstream;
  }) as typeof actual.request;

  return { ...actual, request };
});

describe("/local-model-proxy when the model server's response has no status", () => {
  const fixture = useProxyFixture();

  it("answers 502 with whatever body came", async () => {
    fixture.answerWith((res) => res.end("answer"));

    const res = await fixture.proxy(
      `http://127.0.0.1:${fixture.modelPort()}/v1/models`,
    );

    expect(res.status).toBe(502);
    expect(await res.text()).toBe("answer");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type RequestOverrides } from "#src/mcp-server/helpers/request-overrides/request-overrides.ts";
import { setupRestRoutesServer } from "../express-app-test-helpers.ts";

describe("REST API Routes – caller hangs up", () => {
  const routesState = setupRestRoutesServer({
    getConfig: () => ({ tools: ["ppal-connect"], liveApiEnabled: false }),
  });

  /**
   * POST a tool call.
   * @param signal - Aborts the request from the client side
   * @returns The fetch promise
   */
  function post(signal?: AbortSignal): Promise<Response> {
    return fetch(`${routesState.baseUrl}/api/tools/ppal-connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal,
    });
  }

  /** @returns The signal the route passed on the last call */
  function lastSignal(): AbortSignal | undefined {
    const overrides = routesState.callLiveApi.mock.lastCall?.[2] as
      | RequestOverrides
      | undefined;

    return overrides?.signal;
  }

  it("aborts the call's signal when the client hangs up first", async () => {
    let answer: (value: object) => void = () => {};

    routesState.callLiveApi.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );

    const client = new AbortController();
    const request = post(client.signal);

    await vi.waitFor(() => expect(lastSignal()).toBeDefined());
    client.abort();
    await expect(request).rejects.toThrow("aborted");
    await vi.waitFor(() => expect(lastSignal()?.aborted).toBe(true));

    answer({ content: [{ type: "text", text: "{}" }] });
  });

  it("leaves the signal alone after a normal answer", async () => {
    routesState.callLiveApi.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
    });

    const response = await post();

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastSignal()?.aborted).toBe(false);
  });
});

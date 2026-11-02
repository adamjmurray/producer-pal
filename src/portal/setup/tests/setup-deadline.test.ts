// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  type RemoteScriptReply,
  type RemoteScriptRequest,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type OfflineDeps } from "../../offline/offline-deps.ts";
import { requestWithBrowserRetry } from "../browser-retry-request.ts";
import { pollUntil } from "../poll-until.ts";
import { SETUP_BUDGET_MS, setupDeadline, timeLeft } from "../setup-deadline.ts";

/**
 * @returns Clock dependencies where only sleeping moves time, and the time
 */
function clock(): {
  deps: Pick<OfflineDeps, "now" | "sleep">;
  time: () => number;
} {
  let time = 0;

  return {
    deps: {
      now: () => time,
      sleep: (ms) => {
        time += ms;

        return Promise.resolve();
      },
    },
    time: () => time,
  };
}

const NOT_FOUND: RemoteScriptReply = {
  available: true,
  status: 404,
  body: { error: "no device" },
};

const request = {
  route: "/load",
  body: {},
  thrown: (error: unknown) => new Error(String(error)),
  unavailable: () => new Error("unavailable"),
};

describe("setupDeadline", () => {
  it("is the budget after now", () => {
    expect(setupDeadline({ now: () => 1000 })).toBe(1000 + SETUP_BUDGET_MS);
    expect(SETUP_BUDGET_MS).toBeLessThan(60_000);
  });
});

describe("requestWithBrowserRetry deadline", () => {
  it("lets Live queue a request for at most the time left", async () => {
    const { deps } = clock();
    const send = vi.fn((_: RemoteScriptRequest) => Promise.resolve(NOT_FOUND));

    await requestWithBrowserRetry(request, { ...deps, request: send }, 2000);

    const waits = send.mock.calls.map(([sent]) => sent.expiresInMs);

    // Each ask gets what is left; the last one is not followed by another.
    expect(waits).toStrictEqual([2000, 1500, 1000, 500]);
  });

  it("gives back the not-found it still has when the deadline is near, not an error", async () => {
    const { deps, time } = clock();
    const send = vi.fn((_: RemoteScriptRequest) => Promise.resolve(NOT_FOUND));

    const reply = await requestWithBrowserRetry(
      request,
      { ...deps, request: send },
      700,
    );

    expect(reply).toBe(NOT_FOUND);
    expect(time()).toBeLessThanOrEqual(700);
  });

  it("caps a request that would run to its full 20 s", async () => {
    const { deps } = clock();
    const send = vi.fn((_: RemoteScriptRequest) => Promise.resolve(NOT_FOUND));

    await requestWithBrowserRetry(
      request,
      { ...deps, request: send },
      SETUP_BUDGET_MS,
    );

    expect(send.mock.calls[0]?.[0].expiresInMs).toBe(20_000);
  });
});

describe("pollUntil deadline", () => {
  it("stops at the deadline, not after 30 s", async () => {
    const { deps, time } = clock();

    expect(await pollUntil(() => Promise.resolve(false), deps, 5000)).toBe(
      false,
    );
    expect(time()).toBe(5000);
  });

  it("still stops after 30 s when the deadline is later", async () => {
    const { deps, time } = clock();

    expect(await pollUntil(() => Promise.resolve(false), deps, 90_000)).toBe(
      false,
    );
    expect(time()).toBe(30_000);
  });

  it("tries once when the deadline has already passed", async () => {
    const { deps, time } = clock();
    const attempt = vi.fn(() => Promise.resolve(false));

    expect(await pollUntil(attempt, deps, -1)).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(time()).toBe(0);
  });

  it("returns true as soon as a try works", async () => {
    const { deps } = clock();
    const attempt = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    expect(await pollUntil(attempt, deps, 5000)).toBe(true);
  });
});

describe("timeLeft", () => {
  it("is the time until the deadline", () => {
    expect(timeLeft({ now: () => 1000 }, 31_000)).toBe(30_000);
  });

  it("is never less than 1 ms, since 0 would mean no limit", () => {
    expect(timeLeft({ now: () => 1000 }, 500)).toBe(1);
  });
});

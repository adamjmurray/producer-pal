// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  remoteScriptChange,
  remoteScriptRoute,
} from "#src/tools/shared/remote-script/remote-script-route.ts";
import { remoteScriptExpiry } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const MISSING = "no remote script";

/**
 * Have the Node route answer.
 * @param result - The route's reply
 */
function answers(result: unknown): void {
  vi.mocked(requestNode).mockResolvedValue({ success: true, result });
}

beforeEach(() => {
  vi.clearAllMocks();
  answers({ available: true, result: {} });
});

describe("remoteScriptRoute", () => {
  it("sends a read no expiry", async () => {
    await remoteScriptRoute("r", { a: 1 }, null, MISSING);

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({ a: 1 });
  });
});

describe("remoteScriptChange", () => {
  it("sends the expiry for the wait it gives the route", async () => {
    const deadline = Date.now() + 10_000;

    await remoteScriptChange("w", { a: 1 }, deadline, MISSING);

    const [, args, waitMs] = vi.mocked(requestNode).mock.calls[0] ?? [];

    expect(waitMs as number).toBeLessThanOrEqual(10_000);
    expect(args).toStrictEqual({
      a: 1,
      expiresInMs: remoteScriptExpiry(waitMs as number),
    });
  });

  it("sends nothing once the request has no time left", async () => {
    expect(
      await remoteScriptChange("w", {}, Date.now() - 1, MISSING),
    ).toStrictEqual({
      ok: false,
      reason: REQUEST_OUT_OF_TIME,
      available: true,
      stalled: "out-of-time",
    });
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("calls a change that may have started unanswered, keeping the reason", async () => {
    answers({ available: true, error: "it broke", unfinished: true });

    expect(await remoteScriptChange("w", {}, null, MISSING)).toStrictEqual({
      ok: false,
      reason: "it broke",
      available: true,
      stalled: "unanswered",
    });
  });

  it("calls a refusal a plain failure", async () => {
    answers({ available: true, error: "nothing changed" });

    expect(await remoteScriptChange("w", {}, null, MISSING)).toStrictEqual({
      ok: false,
      reason: "nothing changed",
      available: true,
    });
  });

  it("calls no answer at all unanswered", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    expect(await remoteScriptChange("w", {}, null, MISSING)).toStrictEqual({
      ok: false,
      reason: "the Producer Pal remote script did not answer in time",
      available: true,
      stalled: "unanswered",
    });
  });
});

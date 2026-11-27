// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import {
  remoteScriptChange,
  remoteScriptRoute,
  settledRemoteScriptChange,
} from "#src/tools/shared/remote-script/remote-script-route.ts";
import { remoteScriptExpiry } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import { changedNothing } from "#src/shared/max/v8-warning-capture.ts";
import { provedUnchangedRequest } from "#src/tools/shared/write-pipeline/tests/helpers/proved-unchanged-request.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

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
    await remoteScriptRoute("r", { a: 1 }, null, MISSING, true);

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({ a: 1 });
  });
});

describe("an out-of-date remote script", () => {
  const OUTDATED = {
    available: false,
    outdated: "old; update it with ppal-manage",
    outdatedWithoutManage: "old; have the user update it",
  };

  it("names ppal-manage to a caller that has it", async () => {
    answers(OUTDATED);

    expect(await remoteScriptRoute("r", {}, null, MISSING, true)).toStrictEqual(
      {
        ok: false,
        reason: OUTDATED.outdated,
        available: false,
        outdated: true,
      },
    );
  });

  it("leaves it out for a caller that doesn't", async () => {
    answers(OUTDATED);

    expect(
      await remoteScriptChange("w", {}, null, MISSING, false),
    ).toStrictEqual({
      ok: false,
      reason: OUTDATED.outdatedWithoutManage,
      available: false,
      outdated: true,
    });
  });
});

describe("settledRemoteScriptChange", () => {
  it("answers as remoteScriptChange does when nothing throws", async () => {
    answers({ available: true, result: { n: 1 } });

    expect(
      await settledRemoteScriptChange("w", {}, null, MISSING, true),
    ).toStrictEqual({ ok: true, result: { n: 1 } });
  });

  it("calls a throw unanswered, since the change may have landed", async () => {
    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(
      await settledRemoteScriptChange("w", {}, null, MISSING, true),
    ).toStrictEqual({
      ok: false,
      reason:
        "the Producer Pal remote script did not answer in time (channel closed)",
      available: true,
      stalled: "unanswered",
    });
  });
});

describe("remoteScriptChange", () => {
  it("sends the expiry for the wait it gives the route", async () => {
    const deadline = Date.now() + 10_000;

    await remoteScriptChange("w", { a: 1 }, deadline, MISSING, true);

    const [, args, waitMs] = vi.mocked(requestNode).mock.calls[0] ?? [];

    expect(waitMs as number).toBeLessThanOrEqual(10_000);
    expect(args).toStrictEqual({
      a: 1,
      expiresInMs: remoteScriptExpiry(waitMs as number),
    });
  });

  it("sends nothing once the request has no time left", async () => {
    expect(
      await remoteScriptChange("w", {}, Date.now() - 1, MISSING, true),
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

    expect(
      await remoteScriptChange("w", {}, null, MISSING, true),
    ).toStrictEqual({
      ok: false,
      reason: "it broke",
      available: true,
      stalled: "unanswered",
    });
  });

  it("calls a refusal a plain failure", async () => {
    answers({ available: true, error: "nothing changed" });

    expect(
      await remoteScriptChange("w", {}, null, MISSING, true),
    ).toStrictEqual({
      ok: false,
      reason: "nothing changed",
      available: true,
    });
  });

  it("calls a request too large to send a plain failure, not a stall", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "too large",
      tooLarge: true,
    });

    expect(
      await remoteScriptChange("w", {}, null, MISSING, true),
    ).toStrictEqual({
      ok: false,
      reason: "too large to send to the remote script, so nothing was sent",
      available: true,
      tooLarge: true,
    });
  });

  it("calls no answer at all unanswered", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    expect(
      await remoteScriptChange("w", {}, null, MISSING, true),
    ).toStrictEqual({
      ok: false,
      reason: "the Producer Pal remote script did not answer in time",
      available: true,
      stalled: "unanswered",
    });
  });

  it.each([
    [
      "an unfinished change",
      true,
      {
        success: true,
        result: { available: true, error: "x", unfinished: true },
      },
      true,
    ],
    ["a change with no answer", true, { success: false }, true],
    [
      "a refused change",
      true,
      { success: true, result: { available: true, error: "x" } },
      false,
    ],
    ["a read with no answer", false, { success: false }, false],
    [
      "an unfinished read",
      false,
      {
        success: true,
        result: { available: true, error: "x", unfinished: true },
      },
      false,
    ],
  ])(
    "counts %s as changing the Set: %s",
    async (_name, change, response, changed) => {
      vi.mocked(requestNode).mockResolvedValue(response);

      const capture = provedUnchangedRequest();
      const call = change ? remoteScriptChange : remoteScriptRoute;

      await call("w", {}, null, MISSING, true);
      expect(changedNothing(capture)).toBe(!changed);
    },
  );
});

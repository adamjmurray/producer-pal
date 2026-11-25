// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "../remote-script-test-helpers.ts";
import { markChangedNothing } from "../../forwarded/changed-nothing.ts";
import { remoteScriptRequest } from "../../remote-script-client.ts";
import { STANDARD_TOOL_DEFS } from "../../../../create-mcp-server.ts";
import { withUndoStepEnd } from "../../forwarded/with-undo-step-end.ts";

vi.mock(import("../../remote-script-client.ts"), { spy: true });

const OK = { content: [{ type: "text", text: "{}" }] };
const TIMEOUT = {
  content: [{ type: "text", text: "timed out" }],
  isError: true,
  errorCode: "timeout",
};

const OK_ANSWER: FakeAnswer = { body: { ok: true } };

/**
 * A response V8 proved changed nothing.
 * @returns A fresh response, marked
 */
function unchanged(): { content: object[] } {
  const response = { content: [{ type: "text", text: "{}" }] };

  markChangedNothing(response);

  return response;
}

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

/**
 * Start a stand-in remote script that records each request.
 * @param answer - How it answers
 * @returns The stand-in
 */
async function startScript(
  answer: FakeAnswer = OK_ANSWER,
): Promise<FakeRemoteScript> {
  fake = await startFakeRemoteScript(() => answer);

  return fake;
}

/**
 * Let a fire-and-forget request, if one is coming, arrive.
 * @returns Nothing
 */
async function settle(): Promise<void> {
  // The request starts a microtask after the call returns.
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.allSettled(
    vi.mocked(remoteScriptRequest).mock.results.map((result) => result.value),
  );
}

/**
 * A call that answers OK at once.
 * @returns The wrapped call
 */
function instantCalls(): ReturnType<typeof withUndoStepEnd> {
  return withUndoStepEnd(() => Promise.resolve(OK));
}

/**
 * A call that stays open until the test finishes it.
 * @returns The wrapped call, and a function that finishes the open call
 */
function deferredCalls(): {
  call: ReturnType<typeof withUndoStepEnd>;
  finish: (result: object) => void;
} {
  const resolvers: Array<(result: object) => void> = [];
  const call = withUndoStepEnd(
    () => new Promise<object>((resolve) => resolvers.push(resolve)),
  );

  return { call, finish: (result) => resolvers.shift()?.(result) };
}

describe("withUndoStepEnd", () => {
  it("asks the remote script to end the undo step after a write call", async () => {
    const script = await startScript();
    const call = instantCalls();

    expect(await call("ppal-create-track", {})).toBe(OK);
    await settle();
    expect(script.requests).toHaveLength(1);
    expect(script.requests[0]).toStrictEqual({
      method: "POST",
      route: "/undo/end",
      query: {},
      body: undefined,
    });
  });

  it("does not wait for the remote script", async () => {
    await startScript(null);

    const call = instantCalls();

    expect(await call("ppal-create-track", {})).toBe(OK);
  });

  it("ends the step after an error result and after a throw", async () => {
    const script = await startScript();
    const failed = { content: [], isError: true };
    const failing = withUndoStepEnd(() => Promise.resolve(failed));
    const throwing = withUndoStepEnd(() => Promise.reject(new Error("boom")));

    expect(await failing("ppal-update-clip", {})).toBe(failed);
    await settle();
    expect(script.requests).toHaveLength(1);
    await expect(throwing("ppal-update-clip", {})).rejects.toThrow("boom");
    await settle();
    expect(script.requests).toHaveLength(2);
  });

  it("passes the arguments and overrides through", async () => {
    await startScript();

    const inner = vi.fn(() => Promise.resolve(OK));

    await withUndoStepEnd(inner)(
      "ppal-create-track",
      { a: 1 },
      { timeoutMs: 5 },
    );
    expect(inner).toHaveBeenCalledWith(
      "ppal-create-track",
      { a: 1 },
      { timeoutMs: 5 },
    );
  });

  it("sends an end for exactly the tools that can change the Set", async () => {
    const script = await startScript();
    const call = instantCalls();
    const names = [
      ...STANDARD_TOOL_DEFS.map((def) => def.toolName),
      "ppal-live-api",
    ];
    // ppal-manage is not read-only, but an undo step closed right after an undo
    // could wipe Live's redo history, and an install changes nothing in the Set.
    // ppal-context with no args is a read, which changes nothing either.
    const writes = STANDARD_TOOL_DEFS.filter(
      (def) =>
        def.toolOptions.annotations?.readOnlyHint !== true &&
        def.toolName !== "ppal-manage" &&
        def.toolName !== "ppal-context",
    ).map((def) => def.toolName);

    expect(writes).toContain("ppal-create-track");
    expect(writes).not.toContain("ppal-read-track");

    const sent: Record<string, boolean> = {};
    const expected: Record<string, boolean> = {};

    for (const name of names) {
      const before = script.requests.length;

      await call(name, {});
      await settle();

      sent[name] = script.requests.length > before;
      expected[name] = name === "ppal-live-api" || writes.includes(name);
    }

    expect(sent).toStrictEqual(expected);
  });

  it.each([
    [{}, false],
    [{ action: "read" }, false],
    [{ action: "read", scope: "project" }, false],
    [{ action: "read", scope: "memory", name: "x" }, false],
    [{ action: "read", scope: "global" }, false],
    [{ action: "write", scope: "global", content: "x" }, false],
    [{ action: "write", scope: "memory", name: "x", content: "y" }, false],
    [{ action: "delete", scope: "memory", name: "x" }, false],
    [{ action: "write", content: "x" }, true],
    [{ action: "write", scope: "project", content: "x" }, true],
  ])(
    "ppal-context %j sends an end: %s",
    async (args: Record<string, unknown>, ends: boolean) => {
      const script = await startScript();
      const call = instantCalls();

      await call("ppal-context", args);
      await settle();
      expect(script.requests).toHaveLength(ends ? 1 : 0);
    },
  );

  it.each([
    [{ action: "play-scene", id: "1" }, true],
    [{ action: "play-session-clips", path: "t0/s0" }, false],
    [{ action: "stop-session-clips", path: "t0/s0" }, false],
    [{ action: "stop-all-session-clips" }, false],
    [{ action: "stop" }, true],
    [{ action: "play-arrangement" }, true],
    [{ action: "update-arrangement", loop: true }, true],
    [{}, true],
  ])(
    "ppal-playback %j sends an end: %s",
    async (args: Record<string, unknown>, ends: boolean) => {
      const script = await startScript();
      const call = instantCalls();

      await call("ppal-playback", args);
      await settle();
      expect(script.requests).toHaveLength(ends ? 1 : 0);
    },
  );

  it.each([
    [{ operations: [{ type: "get", property: "tempo" }] }, false],
    [
      {
        path: "live_set",
        operations: [
          { type: "info" },
          { type: "getcount", property: "tracks" },
        ],
      },
      false,
    ],
    [{ operations: [{ type: "get-property", property: "tempo" }] }, false],
    [
      { operations: [{ type: "get" }, { type: "set", property: "tempo" }] },
      true,
    ],
    [{ operations: [{ type: "call", method: "stop_playing" }] }, true],
    [{ operations: [{ type: "getProperty", property: "tempo" }] }, true],
    [{ operations: [{ property: "tempo" }] }, true],
    [{ operations: [] }, false],
    [{}, true],
  ])(
    "ppal-live-api %j sends an end: %s",
    async (args: Record<string, unknown>, ends: boolean) => {
      const script = await startScript();
      const call = instantCalls();

      await call("ppal-live-api", args);
      await settle();
      expect(script.requests).toHaveLength(ends ? 1 : 0);
    },
  );

  it("never ends the step after ppal-manage", async () => {
    const script = await startScript();
    const call = instantCalls();

    await call("ppal-manage", { action: "undo" });
    await call("ppal-manage", { action: "redo" });
    await settle();
    expect(script.requests).toHaveLength(0);
  });

  it("does not count a skipped call among the running writes", async () => {
    const script = await startScript();
    const { call, finish } = deferredCalls();
    const write = call("ppal-create-track", {});
    const read = call("ppal-context", { action: "read" });

    finish(OK);
    await write;
    await settle();
    expect(script.requests).toHaveLength(1);

    finish(OK);
    await read;
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("sends nothing after a call V8 proved changed nothing", async () => {
    const script = await startScript();
    const refused = Object.assign(unchanged(), { isError: true });
    const call = withUndoStepEnd(() => Promise.resolve(refused));

    expect(await call("ppal-update-clip", {})).toBe(refused);
    await settle();
    expect(script.requests).toHaveLength(0);
  });

  it("still ends the step after a call that only said it changed something", async () => {
    const script = await startScript();
    const failed = { content: [], isError: true };
    const call = withUndoStepEnd(() => Promise.resolve(failed));

    await call("ppal-update-clip", {});
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("ends the step when one of overlapping calls may have changed the Set", async () => {
    const script = await startScript();
    const { call, finish } = deferredCalls();
    const noop = call("ppal-update-clip", {});
    const write = call("ppal-create-track", {});

    finish(unchanged());
    await noop;
    finish(OK);
    await write;
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("sends nothing when every overlapping call changed nothing", async () => {
    const script = await startScript();
    const { call, finish } = deferredCalls();
    const first = call("ppal-update-clip", {});
    const second = call("ppal-update-track", {});

    finish(unchanged());
    await first;
    finish(unchanged());
    await second;
    await settle();
    expect(script.requests).toHaveLength(0);
  });

  it("forgets an unchanged group, so a later write still ends", async () => {
    const script = await startScript();
    const { call, finish } = deferredCalls();
    const noop = call("ppal-update-clip", {});

    finish(unchanged());
    await noop;

    const later = call("ppal-create-track", {});

    finish(OK);
    await later;
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("ends the step after a throw, even if an earlier call changed nothing", async () => {
    const script = await startScript();
    const call = withUndoStepEnd(() => Promise.reject(new Error("boom")));

    await expect(call("ppal-update-clip", {})).rejects.toThrow("boom");
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("sends nothing after a timeout", async () => {
    const script = await startScript();
    const call = withUndoStepEnd(() => Promise.resolve(TIMEOUT));

    expect(await call("ppal-create-track", {})).toBe(TIMEOUT);
    await settle();
    expect(script.requests).toHaveLength(0);
  });

  it("sends one end, after the last of overlapping calls settles", async () => {
    const script = await startScript();
    const { call, finish } = deferredCalls();
    const first = call("ppal-create-track", {});
    const second = call("ppal-update-track", {});

    finish(OK);
    await first;
    await settle();
    expect(script.requests).toHaveLength(0);

    finish(OK);
    await second;
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("skips the end for calls that overlapped a timeout, then resumes", async () => {
    const script = await startScript();
    const { call, finish } = deferredCalls();
    const first = call("ppal-create-track", {});
    const second = call("ppal-update-track", {});

    finish(TIMEOUT);
    await first;
    finish(OK);
    await second;
    await settle();
    expect(script.requests).toHaveLength(0);

    const later = call("ppal-create-track", {});

    finish(OK);
    await later;
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("returns the result when the remote script drops the connection", async () => {
    const script = await startScript({ drop: true });
    const call = instantCalls();

    expect(await call("ppal-create-track", {})).toBe(OK);
    await settle();
    expect(script.requests).toHaveLength(1);
  });

  it("returns the result when no remote script answers", async () => {
    // test-setup.ts points the client at a port nothing listens on.
    const call = instantCalls();

    expect(await call("ppal-create-track", {})).toBe(OK);
    await settle();
  });
});

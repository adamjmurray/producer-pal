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
import { STANDARD_TOOL_DEFS } from "../../../../create-mcp-server.ts";
import { withUndoStepEnd } from "../../forwarded/with-undo-step-end.ts";

const OK = { content: [{ type: "text", text: "{}" }] };
const TIMEOUT = {
  content: [{ type: "text", text: "timed out" }],
  isError: true,
  errorCode: "timeout",
};

const OK_ANSWER: FakeAnswer = { body: { ok: true } };

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
  await new Promise((resolve) => setTimeout(resolve, 60));
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
    const call = withUndoStepEnd(() => Promise.resolve(OK));

    expect(await call("ppal-create-track", {})).toBe(OK);
    await vi.waitFor(() => expect(script.requests).toHaveLength(1));
    expect(script.requests[0]).toStrictEqual({
      method: "POST",
      route: "/undo/end",
      query: {},
      body: undefined,
    });
  });

  it("does not wait for the remote script", async () => {
    await startScript(null);

    const call = withUndoStepEnd(() => Promise.resolve(OK));

    expect(await call("ppal-create-track", {})).toBe(OK);
  });

  it("ends the step after an error result and after a throw", async () => {
    const script = await startScript();
    const failed = { content: [], isError: true };
    const failing = withUndoStepEnd(() => Promise.resolve(failed));
    const throwing = withUndoStepEnd(() => Promise.reject(new Error("boom")));

    expect(await failing("ppal-update-clip", {})).toBe(failed);
    await vi.waitFor(() => expect(script.requests).toHaveLength(1));
    await expect(throwing("ppal-update-clip", {})).rejects.toThrow("boom");
    await vi.waitFor(() => expect(script.requests).toHaveLength(2));
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
    const call = withUndoStepEnd(() => Promise.resolve(OK));
    const names = [
      ...STANDARD_TOOL_DEFS.map((def) => def.toolName),
      "ppal-live-api",
    ];
    // ppal-manage is not read-only, but an undo step closed right after an undo
    // could wipe Live's redo history, and an install changes nothing in the Set.
    const writes = STANDARD_TOOL_DEFS.filter(
      (def) =>
        def.toolOptions.annotations?.readOnlyHint !== true &&
        def.toolName !== "ppal-manage",
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
    await vi.waitFor(() => expect(script.requests).toHaveLength(1));
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
    await vi.waitFor(() => expect(script.requests).toHaveLength(1));
  });

  it("returns the result when the remote script drops the connection", async () => {
    const script = await startScript({ drop: true });
    const call = withUndoStepEnd(() => Promise.resolve(OK));

    expect(await call("ppal-create-track", {})).toBe(OK);
    await vi.waitFor(() => expect(script.requests).toHaveLength(1));
    await settle();
  });

  it("returns the result when no remote script answers", async () => {
    // test-setup.ts points the client at a port nothing listens on.
    const call = withUndoStepEnd(() => Promise.resolve(OK));

    expect(await call("ppal-create-track", {})).toBe(OK);
    await settle();
  });
});

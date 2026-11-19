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
import {
  UNDO_END_WAIT_MS,
  endUndoStep,
} from "../../forwarded/end-undo-step.ts";

vi.mock(import("../../remote-script-client.ts"), { spy: true });

const OK = { content: [{ type: "text", text: "{}" }] };

const OK_ANSWER: FakeAnswer = { body: { ok: true } };

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  vi.useRealTimers();
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

describe("endUndoStep", () => {
  it("asks the remote script to end the undo step, and settles on its answer", async () => {
    const script = await startScript();

    await endUndoStep("ppal-create-track", {}, OK);
    expect(script.requests).toStrictEqual([
      { method: "POST", route: "/undo/end", query: {}, body: undefined },
    ]);
  });

  it("settles after UNDO_END_WAIT_MS when the remote script doesn't answer", async () => {
    vi.useFakeTimers();
    vi.mocked(remoteScriptRequest).mockReturnValueOnce(new Promise(() => {}));

    let settled = false;

    void endUndoStep("ppal-create-track", {}, OK)?.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(UNDO_END_WAIT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("ends the step after an error result and after a throw", async () => {
    const script = await startScript();

    await endUndoStep("ppal-update-clip", {}, { content: [], isError: true });
    await endUndoStep("ppal-update-clip", {}, undefined);
    expect(script.requests).toHaveLength(2);
  });

  it("sends nothing after a call V8 proved changed nothing", () => {
    const refused = { content: [], isError: true };

    markChangedNothing(refused);
    expect(endUndoStep("ppal-update-clip", {}, refused)).toBeUndefined();
  });

  it("sends an end for exactly the tools that can change the Set", async () => {
    const script = await startScript();
    const names = [
      ...STANDARD_TOOL_DEFS.map((def) => def.toolName),
      "ppal-live-api",
    ];
    // ppal-manage is not read-only, but an end clears its undo guard, and an
    // install changes nothing in the Set. ppal-context with no args is a read.
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

      await endUndoStep(name, {}, OK);

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

      await endUndoStep("ppal-context", args, OK);
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

      await endUndoStep("ppal-playback", args, OK);
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

      await endUndoStep("ppal-live-api", args, OK);
      expect(script.requests).toHaveLength(ends ? 1 : 0);
    },
  );

  it("never ends the step after ppal-manage", () => {
    expect(endUndoStep("ppal-manage", { action: "undo" }, OK)).toBeUndefined();
    expect(endUndoStep("ppal-manage", { action: "redo" }, OK)).toBeUndefined();
  });

  it("settles when the remote script drops the connection", async () => {
    const script = await startScript({ drop: true });

    await endUndoStep("ppal-create-track", {}, OK);
    expect(script.requests).toHaveLength(1);
  });

  it("settles when no remote script answers", async () => {
    // test-setup.ts points the client at a port nothing listens on.
    await expect(
      endUndoStep("ppal-create-track", {}, OK),
    ).resolves.toBeUndefined();
  });
});

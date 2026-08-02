// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Lifecycle races in spawnAgentCli — a broken stdin pipe against the exit, and
 * two stop signals against one kill timer.
 *
 * The sibling agent-cli-spawn tests drive a real subprocess, which can't stage
 * either ordering on purpose. These mock `spawn` and emit the events by hand.
 */

import { EventEmitter } from "node:events";
import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODEX_CLI_TRANSPORT } from "../../codex/codex-cli-protocol.ts";
import { toJsonl } from "./agent-cli-test-helpers.ts";

const spawnMock = vi.fn();

vi.mock(import("node:child_process"), () => ({ spawn: spawnMock }));

const { spawnAgentCli } = await import("../agent-cli-spawn.ts");

/** A child whose streams and exit a test drives event by event. */
interface FakeChild extends EventEmitter {
  stdout: EventEmitter & { setEncoding: () => void };
  stderr: EventEmitter & { setEncoding: () => void };
  stdin: EventEmitter & { end: () => void };
  kill: ReturnType<typeof vi.fn>;
}

/**
 * Build the fake child and hand it to the next spawn.
 *
 * @returns The child, ready to emit
 */
function stageChild(): FakeChild {
  const stream = (): EventEmitter & { setEncoding: () => void } =>
    Object.assign(new EventEmitter(), { setEncoding: () => {} });
  const child = Object.assign(new EventEmitter(), {
    stdout: stream(),
    stderr: stream(),
    stdin: Object.assign(new EventEmitter(), { end: () => {} }),
    kill: vi.fn(),
  });

  spawnMock.mockReturnValue(child as unknown as ChildProcessWithoutNullStreams);

  return child;
}

/** Two completed MCP calls, enough to blow a budget of one. */
const twoToolCalls = toJsonl(
  ["call-1", "call-2"].map((id) => ({
    type: "item.completed",
    item: { id, type: "mcp_tool_call", tool: "ppal-read-song" },
  })),
);

describe("spawnAgentCli lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reports the exit, not the broken pipe, when the CLI quits early", async () => {
    const child = stageChild();
    const promise = spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", { cwd: "/x" });

    child.stderr.emit("data", "error: not logged in\n");
    // The child was gone before it drained stdin. Pre-fix this rejected on the
    // spot, usually beating `close` and losing the exit code and stderr.
    child.stdin.emit("error", new Error("write EPIPE"));
    child.emit("close", 2);

    await expect(promise).rejects.toThrow(
      /codex CLI exited 2.*stderr: error: not logged in.*prompt was not fully written: write EPIPE/s,
    );
  });

  it("still fails a clean exit whose prompt never landed", async () => {
    const child = stageChild();
    const promise = spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", { cwd: "/x" });

    child.stdin.emit("error", new Error("write EPIPE"));
    child.emit("close", 0);

    await expect(promise).rejects.toThrow("write EPIPE");
  });

  it("cancels both kill timers when a turn is stopped twice", async () => {
    vi.useFakeTimers();
    const child = stageChild();
    const promise = spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", {
      cwd: "/x",
      stepBudget: 1,
      timeoutMs: 50,
    });

    // Budget kill first, then the wall-clock timeout — terminate() runs twice.
    child.stdout.emit("data", twoToolCalls);
    vi.advanceTimersByTime(50);
    child.emit("close", null);

    await expect(promise).rejects.toThrow("hit the step budget of 1 steps");
    // A replaced handle leaves the first kill timer pending, holding the event
    // loop open for its full grace period to SIGKILL a reaped pid.
    expect(vi.getTimerCount()).toBe(0);
  });
});

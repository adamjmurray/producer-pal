// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { type RequestOverrides } from "#src/mcp-server/helpers/request-overrides/request-overrides.ts";
import {
  READ,
  type Sent,
  TIMEOUT_MS,
  WRITE,
  setup,
  settle,
} from "./write-queue-test-helpers.ts";
import { isWriteCall } from "./write-calls.ts";
import { MIN_RUN_BUDGET_MS, type withWriteQueue } from "./write-queue.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { isChangedNothing } from "#src/mcp-server/rpc/remote-script/forwarded/changed-nothing.ts";

/**
 * Two writes, the second queued behind the first.
 * @param overrides - The second write's overrides
 * @returns The setup, plus both writes' answers
 */
function queueTwoWrites(overrides?: RequestOverrides): ReturnType<
  typeof setup
> & {
  first: Promise<McpResponse>;
  second: Promise<McpResponse>;
} {
  const { call, sent } = setup();

  return {
    call,
    sent,
    first: call(WRITE, {}),
    second: call(WRITE, {}, overrides),
  };
}

/**
 * Expects the queue, with one write sent so far, to take the next one at once.
 * @param call - The queued call function
 * @param sent - The calls that reached V8
 */
async function expectQueueFree(
  call: ReturnType<typeof withWriteQueue>,
  sent: Sent[],
): Promise<void> {
  const next = call(WRITE, {});

  await settle();
  expect(sent).toHaveLength(2);
  sent[1]?.answer();
  await next;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("withWriteQueue", () => {
  it("runs two parallel writes one after the other", async () => {
    const { sent, first, second } = queueTwoWrites();

    await settle();
    expect(sent).toHaveLength(1);

    sent[0]?.answer();
    await first;
    await settle();
    expect(sent).toHaveLength(2);

    sent[1]?.answer();
    await second;
  });

  it("holds reads until every write ahead of them answers, then runs them together", async () => {
    vi.useFakeTimers();
    const { call, sent, first, second } = queueTwoWrites();
    const reads = [call(READ, {}), call(READ, {})];

    await settle();
    expect(sent.map((s) => s.tool)).toStrictEqual([WRITE]);

    sent[0]?.answer();
    await first;
    await settle();
    expect(sent.map((s) => s.tool)).toStrictEqual([WRITE, WRITE]);

    vi.advanceTimersByTime(2000);
    sent[1]?.answer();
    await second;
    await settle();
    expect(sent.slice(2).map((s) => [s.tool, s.queuedMs])).toStrictEqual([
      [READ, 2000],
      [READ, 2000],
    ]);

    sent[2]?.answer();
    sent[3]?.answer();
    await Promise.all(reads);
  });

  it("runs a read alongside a write that arrived after it", async () => {
    const { call, sent } = setup();
    const read = call(READ, {});
    const write = call(WRITE, {});

    await settle();
    expect(sent.map((s) => s.tool)).toStrictEqual([READ, WRITE]);

    sent[0]?.answer();
    sent[1]?.answer();
    await Promise.all([read, write]);
  });

  it("releases a read when the write ahead of it throws", async () => {
    const { call, sent } = setup();
    const write = call(WRITE, {});
    const read = call(READ, {});

    await settle();
    sent[0]?.fail(new Error("boom"));
    await expect(write).rejects.toThrow("boom");
    await settle();
    expect(sent.map((s) => s.tool)).toStrictEqual([WRITE, READ]);

    sent[1]?.answer();
    await read;
  });

  it("gives up on a read that runs out of time waiting, and never runs it", async () => {
    vi.useFakeTimers();
    const { call, sent } = setup();
    const write = call(WRITE, {});
    const read = call(READ, {});

    await settle();
    vi.advanceTimersByTime(TIMEOUT_MS - MIN_RUN_BUDGET_MS);

    const answer = await read;

    expect(answer.content[0]?.text).toMatch(/^Not run: waited 40s/);
    expect(isChangedNothing(answer)).toBe(true);

    sent[0]?.answer();
    await write;
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("gives up on a read whose writes answer too late, before the timer fires", async () => {
    vi.useFakeTimers();
    const { call, sent } = setup();
    const write = call(WRITE, {});
    const read = call(READ, {}, { timeoutMs: 200 });

    await settle();
    vi.setSystemTime(Date.now() + 300);
    sent[0]?.answer();
    await write;

    const answer = await read;

    expect(answer.content[0]?.text).toMatch(/^Not run: waited 0.3s/);
    expect(sent).toHaveLength(1);
  });

  it("drops a waiting read whose caller goes away, or already went", async () => {
    const { call, sent } = setup();
    const controller = new AbortController();
    const write = call(WRITE, {});
    const read = call(READ, {}, { signal: controller.signal });
    const gone = await call(READ, {}, { signal: AbortSignal.abort() });

    await settle();
    controller.abort();

    for (const answer of [await read, gone]) {
      expect(answer.content[0]?.text).toMatch(
        /^Not run: the caller disconnected/,
      );
    }

    sent[0]?.answer();
    await write;
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("passes the turn on when a write throws", async () => {
    const { sent, first, second } = queueTwoWrites();

    await settle();
    sent[0]?.fail(new Error("boom"));
    await expect(first).rejects.toThrow("boom");
    await settle();
    expect(sent).toHaveLength(2);

    sent[1]?.answer();
    await second;
  });

  it("tells V8 how long a queued write waited", async () => {
    vi.useFakeTimers();
    const { sent, first, second } = queueTwoWrites();

    await settle();
    vi.advanceTimersByTime(10_000);
    sent[0]?.answer();
    await first;
    await settle();

    expect(sent.map((s) => [s.overrides, s.queuedMs])).toStrictEqual([
      [{}, 0],
      [{}, 10_000],
    ]);

    sent[1]?.answer();
    await second;
  });

  it("keeps a REST timeout override whole beside the wait", async () => {
    vi.useFakeTimers();
    const { sent, first, second } = queueTwoWrites({
      timeoutMs: 20_000,
      compactOutput: true,
    });

    await settle();
    vi.advanceTimersByTime(3000);
    sent[0]?.answer();
    await first;
    await settle();

    expect(sent[1]?.overrides).toStrictEqual({
      timeoutMs: 20_000,
      compactOutput: true,
    });
    expect(sent[1]?.queuedMs).toBe(3000);

    sent[1]?.answer();
    await second;
  });

  it("gives up on a queued write that runs out of time, and never runs it", async () => {
    vi.useFakeTimers();
    const { call, sent, first, second } = queueTwoWrites();

    await settle();
    vi.advanceTimersByTime(TIMEOUT_MS - MIN_RUN_BUDGET_MS);

    const answer = await second;

    expect(answer.isError).toBe(true);
    expect(answer.content[0]?.text).toBe(
      "Not run: waited 40s for other Producer Pal writes to finish and ran " +
        "out of time. Nothing changed; retry it.",
    );
    expect(isChangedNothing(answer)).toBe(true);

    sent[0]?.answer();
    await first;
    await settle();
    expect(sent).toHaveLength(1);

    // The queue is free again.
    await expectQueueFree(call, sent);
  });

  it("gives up when its turn comes too late, before the timer fires", async () => {
    vi.useFakeTimers();
    const { call, sent, first, second } = queueTwoWrites({ timeoutMs: 200 });

    await settle();
    // Past the give-up point (100ms), but the timer hasn't run yet.
    vi.setSystemTime(Date.now() + 300);
    sent[0]?.answer();
    await first;

    const answer = await second;

    expect(answer.content[0]?.text).toMatch(/^Not run: waited 0.3s/);
    expect(sent).toHaveLength(1);

    // The turn is free again.
    await expectQueueFree(call, sent);
  });

  it("gives up at half a short timeout", async () => {
    vi.useFakeTimers();
    const { sent, first, second } = queueTwoWrites({ timeoutMs: 2000 });

    await settle();
    vi.advanceTimersByTime(999);
    await settle();
    let done = false;

    void second.then(() => (done = true));
    await settle();
    expect(done).toBe(false);

    vi.advanceTimersByTime(1);
    const answer = await second;

    expect(answer.content[0]?.text).toMatch(/^Not run: waited 1s/);

    sent[0]?.answer();
    await first;
  });

  it("drops a queued write whose caller goes away", async () => {
    const { call, sent } = setup();
    const controller = new AbortController();
    const first = call(WRITE, {});
    const second = call(WRITE, {}, { signal: controller.signal });
    const third = call(WRITE, {});

    await settle();
    controller.abort();

    const answer = await second;

    expect(answer.content[0]?.text).toBe(
      "Not run: the caller disconnected before its turn. Nothing changed.",
    );
    expect(isChangedNothing(answer)).toBe(true);

    sent[0]?.answer();
    await first;
    await settle();
    expect(sent).toHaveLength(2);

    sent[1]?.answer();
    await third;
  });

  it("doesn't start a write whose caller already went away", async () => {
    const { call, sent } = setup();
    const answer = await call(WRITE, {}, { signal: AbortSignal.abort() });

    expect(answer.content[0]?.text).toMatch(
      /^Not run: the caller disconnected/,
    );
    expect(sent).toHaveLength(0);
  });

  it("ignores an abort once the write is running", async () => {
    const { call, sent } = setup();
    const controller = new AbortController();
    const write = call(WRITE, {}, { signal: controller.signal });

    await settle();
    controller.abort();
    sent[0]?.answer();
    const answer = await write;

    expect(answer.content[0]?.text).toBe(WRITE);
  });

  it("keeps the signal away from V8", async () => {
    const { call, sent } = setup();
    const signal = new AbortController().signal;
    const read = call(READ, {}, { signal, compactOutput: true });
    const write = call(WRITE, {}, { signal });

    await settle();
    expect(sent.map((s) => [s.tool, s.overrides])).toStrictEqual([
      [READ, { compactOutput: true }],
      [WRITE, {}],
    ]);

    sent[0]?.answer();
    sent[1]?.answer();
    await Promise.all([read, write]);
  });
});

describe("isWriteCall", () => {
  it.each([
    ["ppal-update-clip", {}, true],
    ["ppal-manage", { action: "undo" }, true],
    ["ppal-live-api", { operations: [{ type: "call", method: "x" }] }, true],
    ["ppal-live-api", { operations: [{ type: "get-property" }] }, false],
    ["ppal-playback", { action: "stop-all-session-clips" }, false],
    ["ppal-playback", { action: "play-scene" }, true],
    ["ppal-context", { action: "read" }, false],
    ["ppal-read-live-set", {}, false],
    ["ppal-select", {}, false],
    ["ppal-connect", {}, false],
    ["no-such-tool", {}, false],
  ])("%s %j -> %s", (tool, args, expected) => {
    expect(isWriteCall(tool, args)).toBe(expected);
  });
});

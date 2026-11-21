// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READ,
  type Sent,
  WRITE,
  setup,
  settle,
} from "./write-queue-test-helpers.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { MIN_RUN_BUDGET_MS, withWriteQueue } from "./write-queue.ts";

const W = "W";
const R = "R";

/**
 * @param sent - The calls that reached V8
 * @returns The order they were sent in, as W (write) and R (read)
 */
function order(sent: Sent[]): string[] {
  return sent.map((s) => (s.tool === WRITE ? W : R));
}

/**
 * Answers one call in V8, then waits for the queue to react.
 * @param sent - The calls that reached V8
 * @param index - Which call to answer
 * @returns The send order afterwards
 */
async function answer(sent: Sent[], index: number): Promise<string[]> {
  sent[index]?.answer();
  await settle();

  return order(sent);
}

/**
 * Answers everything V8 still holds, so the queue is empty for the next test.
 * @param sent - The calls that reached V8
 * @param calls - Every call the test made
 */
async function finish(
  sent: Sent[],
  calls: Promise<McpResponse>[],
): Promise<void> {
  for (const s of sent) {
    s.answer();
  }

  await Promise.all(calls);
}

/**
 * @param response - A call's answer
 * @returns The text of its first content block
 */
async function textOf(
  response: Promise<McpResponse>,
): Promise<string | undefined> {
  const { content } = await response;

  return content[0]?.text;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("withWriteQueue send order", () => {
  it("sends a read before the write that arrived after it", async () => {
    const { call, sent } = setup();
    const calls = [WRITE, READ, WRITE].map((tool) => call(tool, {}));

    await settle();
    expect(order(sent)).toStrictEqual([W]);
    expect(await answer(sent, 0)).toStrictEqual([W, R, W]);
    await finish(sent, calls);
  });

  it("keeps arrival order through W R W R W", async () => {
    const { call, sent } = setup();
    const calls = [WRITE, READ, WRITE, READ, WRITE].map((tool) =>
      call(tool, {}),
    );

    await settle();
    expect(await answer(sent, 0)).toStrictEqual([W, R, W]);

    // The first read has not answered; the next write still goes.
    expect(await answer(sent, 2)).toStrictEqual([W, R, W, R, W]);
    await finish(sent, calls);
  });

  it("sends a read waiting on two writes before the third write", async () => {
    const { call, sent } = setup();
    const calls = [WRITE, WRITE, READ, WRITE].map((tool) => call(tool, {}));

    await settle();
    expect(await answer(sent, 0)).toStrictEqual([W, W]);
    expect(await answer(sent, 1)).toStrictEqual([W, W, R, W]);
    await finish(sent, calls);
  });

  it("sends a read before the next write when the write ahead of it throws", async () => {
    const { call, sent } = setup();
    const calls = [WRITE, READ, WRITE].map((tool) => call(tool, {}));

    await settle();
    sent[0]?.fail(new Error("boom"));
    await expect(calls[0]).rejects.toThrow("boom");
    await settle();
    expect(order(sent)).toStrictEqual([W, R, W]);
    await finish(sent.slice(1), calls.slice(1));
  });

  it("doesn't let a held read whose caller aborts stall the next write", async () => {
    const { call, sent } = setup();
    const controller = new AbortController();
    const first = call(WRITE, {});
    const read = call(READ, {}, { signal: controller.signal });
    const second = call(WRITE, {});

    await settle();
    controller.abort();
    expect(await textOf(read)).toMatch(/^Not run: the caller/);
    expect(await answer(sent, 0)).toStrictEqual([W, W]);
    await finish(sent, [first, second]);
  });

  it("doesn't let a held read that times out stall the next write", async () => {
    vi.useFakeTimers();
    const { call, sent } = setup();
    const first = call(WRITE, {});
    const read = call(READ, {}, { timeoutMs: 10_000 });
    const second = call(WRITE, {});

    await settle();
    vi.advanceTimersByTime(10_000 - MIN_RUN_BUDGET_MS);
    expect(await textOf(read)).toMatch(/^Not run: waited 5s/);
    expect(await answer(sent, 0)).toStrictEqual([W, W]);
    await finish(sent, [first, second]);
  });

  it("doesn't strand a read behind a queued write that gives up", async () => {
    vi.useFakeTimers();
    const { call, sent } = setup();
    const first = call(WRITE, {});
    const second = call(WRITE, {}, { timeoutMs: 10_000 });
    const read = call(READ, {});

    await settle();
    vi.advanceTimersByTime(10_000 - MIN_RUN_BUDGET_MS);
    expect(await textOf(second)).toMatch(/^Not run: waited 5s/);
    await settle();
    expect(order(sent)).toStrictEqual([W]);

    // The read still waits for the write that is running.
    expect(await answer(sent, 0)).toStrictEqual([W, R]);
    await finish(sent, [first, read]);
  });

  it("sends a read before the next write when the write between them gives up at its turn", async () => {
    vi.useFakeTimers();
    const { call, sent } = setup();
    const first = call(WRITE, {});
    const second = call(WRITE, {}, { timeoutMs: 200 });
    const read = call(READ, {});
    const third = call(WRITE, {});

    await settle();
    vi.setSystemTime(Date.now() + 300);
    expect(await answer(sent, 0)).toStrictEqual([W, R, W]);
    expect(await textOf(second)).toMatch(/^Not run: waited 0.3s/);
    await finish(sent, [first, read, third]);
  });

  it("still starts the next write when sending a released read throws", async () => {
    const write = vi.fn(() => Promise.resolve({ content: [] }));
    const send = vi.fn((tool: string) => {
      if (tool === READ) {
        throw new Error("boom");
      }

      return write();
    });
    const call = withWriteQueue(send, () => 45_000);
    const calls = [call(WRITE, {}), call(READ, {}), call(WRITE, {})];

    await expect(calls[1]).rejects.toThrow("boom");
    await calls[0];
    await calls[2];
    expect(send).toHaveBeenCalledTimes(3);
  });
});

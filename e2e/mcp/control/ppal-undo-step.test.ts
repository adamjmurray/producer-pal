// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for one undo step per write tool call, parallel calls included.
 * After each write call, Node asks the remote script to end Live's pending undo
 * step, so a single undo reverts one call instead of everything since the Set
 * opened.
 *
 * Every test opens a fresh Set and only undoes its own track creations.
 *
 * Run with: npm run e2e:mcp -- control/ppal-undo-step
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  appendTracksInOneCall,
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../device/helpers/remote-script-test-helpers.ts";
import { connectTimingClient } from "../device/helpers/in-flight-calls-test-helpers.ts";
import { readTrackCount } from "../device/helpers/track-count-test-helpers.ts";

describe.skipIf(!REMOTE_SCRIPT_E2E)("one undo step per write call", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  // ppal-live-api, which runs the undo, is off unless a test turns it on.
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  afterEach(resetConfig);

  const trackCount = (): Promise<number> => readTrackCount(ctx.client!);

  /** Undo once, as Cmd+Z in Live would. */
  async function undoOnce(): Promise<void> {
    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "call", method: "undo" }],
      },
    });
    await sleep(150);
  }

  /**
   * Make two write calls of one track each, then undo once.
   * @returns How many of the two tracks the undo removed
   */
  async function undoAfterTwoCalls(): Promise<number> {
    const before = await trackCount();

    await appendTracksInOneCall(ctx.client!, 1);
    await appendTracksInOneCall(ctx.client!, 1);
    expect(await trackCount()).toBe(before + 2);

    await undoOnce();

    return before + 2 - (await trackCount());
  }

  it("undoes only the last of two write calls", async () => {
    expect(await undoAfterTwoCalls()).toBe(1);
  });

  it("undoes only one of two write calls sent in parallel", async () => {
    const before = await trackCount();

    // The bigger call runs long enough for the other to arrive and queue.
    // Calls that never overlapped get a step each anyway, so the test checks
    // at the HTTP level that both requests were in flight together.
    const { client, toolCalls } = await connectTimingClient();

    try {
      await Promise.all([
        appendTracksInOneCall(client, 12),
        appendTracksInOneCall(client, 1),
      ]);
    } finally {
      await client.close();
    }

    expect(toolCalls).toHaveLength(2);
    expect(
      toolCalls.every(({ answeredAt }) => answeredAt > 0),
      "a response was never read",
    ).toBe(true);
    expect(
      Math.max(...toolCalls.map(({ sentAt }) => sentAt)),
      "the second request left after the first was answered; they didn't overlap",
    ).toBeLessThan(Math.min(...toolCalls.map(({ answeredAt }) => answeredAt)));
    expect(await trackCount()).toBe(before + 13);

    await undoOnce();

    // Whichever call ran last is undone; both together would be 13.
    expect([1, 12]).toContain(before + 13 - (await trackCount()));
  });

  it("undoes a call that makes several changes in one undo", async () => {
    const before = await trackCount();

    await appendTracksInOneCall(ctx.client!, 3);
    expect(await trackCount()).toBe(before + 3);

    await undoOnce();
    expect(await trackCount()).toBe(before);
  });

  it("undoes both calls together when the remote script is switched off", async () => {
    await setConfig({ remoteScriptEnabled: false });

    expect(await undoAfterTwoCalls()).toBe(2);
  });
});

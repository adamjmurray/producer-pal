// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for one undo step per write tool call. After each write call, Node
 * asks the remote script to end Live's pending undo step, so a single undo
 * reverts one call instead of everything since the Set opened. Opt-in like the
 * other remote script suites: skipped unless E2E_REMOTE_SCRIPT=true, and failed
 * when that's set but the script isn't answering.
 *
 * Every test opens a fresh Set and only undoes its own track creations.
 *
 * Run with: npm run e2e:mcp:remote-script -- control/ppal-undo-step
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

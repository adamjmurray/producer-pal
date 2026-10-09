// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for where ppal-update-live-set leaves the playhead and the start
 * marker after it creates or deletes locators.
 * Automatically opens the e2e-test-set Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { liveApi } from "../clip/helpers/arrangement-lane-test-helpers.ts";
import { setConfig, setupMcpTestContext, sleep } from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-live-set locators and the transport", () => {
  it("leaves the playhead where it was when locators are created and deleted", async () => {
    // Live makes and removes a locator at the playhead, so each one moves it
    // there: the tool has to put it back. Beat 6 is bar 2 beat 3, clear of the
    // Set's locators and of the two made here.
    const playheadBeats = 6;

    // The config resets before each test, which hides ppal-live-api.
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

    const sendPlayhead = async (): Promise<void> => {
      await liveApi(ctx.client!, "live_set", [
        {
          type: "set-property",
          property: "current_song_time",
          value: playheadBeats,
        },
      ]);
      await sleep(250);
    };

    const readPlayhead = async (): Promise<number> => {
      const read = await liveApi(ctx.client!, "live_set", [
        { type: "get-property", property: "current_song_time" },
      ]);

      return read.results[0] as number;
    };

    await sendPlayhead();
    expect(await readPlayhead()).toBe(playheadBeats);

    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        locatorOperation: "create",
        locatorTime: "5|1,6|1",
        locatorName: "E2E Playhead A,E2E Playhead B",
      },
    });
    await sleep(250);

    expect(await readPlayhead()).toBe(playheadBeats);

    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { locatorOperation: "delete", locatorTime: "5|1,6|1" },
    });
    await sleep(250);

    expect(await readPlayhead()).toBe(playheadBeats);
  });

  it("keeps the start marker when it stops a playing Set to edit locators", async () => {
    // Stopping a Set that was playing, and writing the playhead after, drag the
    // start marker to where playback stopped: the tool has to put it back.
    // 13|3 has no locator.
    const startBeats = 6;

    // The config resets before each test, which hides ppal-live-api.
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

    await liveApi(ctx.client!, "live_set", [
      {
        type: "set-property",
        property: "current_song_time",
        value: startBeats,
      },
      { type: "set-property", property: "start_time", value: startBeats },
    ]);
    await sleep(250);
    await liveApi(ctx.client!, "live_set", [
      { type: "call", method: "start_playing" },
    ]);
    await sleep(500);

    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        locatorOperation: "create",
        locatorTime: "13|3",
        locatorName: "E2E Start Marker",
      },
    });
    await sleep(250);

    const read = await liveApi(ctx.client!, "live_set", [
      { type: "get-property", property: "is_playing" },
      { type: "get-property", property: "start_time" },
    ]);

    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { locatorOperation: "delete", locatorTime: "13|3" },
    });

    expect(read.results).toStrictEqual([0, startBeats]);
  });
});

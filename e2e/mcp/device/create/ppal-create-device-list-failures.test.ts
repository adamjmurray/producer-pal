// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for how a ppal-create-device path list answers a bad entry: one
 * that can't be parsed refuses the call, one that parses but names no place
 * skips only its own target.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/create/ppal-create-device-list-failures
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  readDeviceCount,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

/** One entry of a path list's answer: a created device, or a skip. */
interface ListEntry {
  id?: string;
  path: string;
  ok?: false;
  detail?: string;
}

describe("ppal-create-device path lists", () => {
  /**
   * A fresh MIDI track to build on, so the Set's own tracks stay intact.
   * @returns The new track's index
   */
  async function createTrack(): Promise<number> {
    const track = parseToolResult<{ id: string; path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "midi" },
      }),
    );

    await sleep(100);

    return trackIndexFromPath(track.path);
  }

  it("refuses the whole call for a path it can't parse", async () => {
    const trackIndex = await createTrack();
    const before = await readDeviceCount(ctx.client!, trackIndex);
    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {
        device: "Utility",
        path: `t${trackIndex}/d+,not-a-path,t${trackIndex}/d+`,
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain('invalid path "not-a-path"');
    expect(await readDeviceCount(ctx.client!, trackIndex)).toBe(before);
  });

  it("skips a path that parses but can't hold a device, and makes the rest", async () => {
    const trackIndex = await createTrack();
    const before = await readDeviceCount(ctx.client!, trackIndex);
    const results = parseToolResult<ListEntry[]>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: {
          device: "Utility",
          path: `t${trackIndex}/d+,s0,t${trackIndex}/d+`,
        },
      }),
    );

    expect(results).toHaveLength(3);
    expect(results[0]?.id).toBeDefined();
    expect(results[0]?.ok).toBeUndefined();
    expect(results[1]).toStrictEqual({
      path: "s0",
      ok: false,
      detail: expect.stringContaining("a scene holds no devices"),
    });
    expect(results[2]?.id).toBeDefined();
    expect(results[2]?.ok).toBeUndefined();
    expect(await readDeviceCount(ctx.client!, trackIndex)).toBe(before + 2);
  });

  // Live keeps an instrument ahead of the audio effects, so the effect named
  // first is pushed down a slot by the instrument named second.
  it("names each device where it sits after the call", async () => {
    const trackIndex = await createTrack();
    const results = parseToolResult<ListEntry[]>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: {
          device: "Auto Filter,Operator",
          path: `t${trackIndex}/d+,t${trackIndex}/d+`,
        },
      }),
    );

    expect(results).toHaveLength(2);

    const [effect, instrument] = results as [ListEntry, ListEntry];
    const indexOf = (entry: ListEntry): number =>
      Number(entry.path.match(/\/d(\d+)$/)?.[1]);

    expect(indexOf(instrument)).toBeLessThan(indexOf(effect));
    await sleep(100);

    // Each path reads back the device its entry names, whatever else a
    // default track preset put on the track.
    for (const [entry, type] of [
      [effect, /Auto ?Filter/i],
      [instrument, /Operator/i],
    ] as const) {
      const read = parseToolResult<{ id: string; type: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path: entry.path },
        }),
      );

      expect(read.id).toBe(entry.id);
      expect(read.type).toMatch(type);
    }
  });
});

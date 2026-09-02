// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E regression test for multi-device deletion ordering inside a rack.
 *
 * `delete_device N` is positional, so deleting several devices in one call must
 * order the deletes so an earlier one never shifts a later target's index. The
 * hard case is a rack chain holding sibling devices PLUS a device in a sibling
 * chain of the same rack: the two chains' parent paths are equal length, which
 * an earlier string-length-based comparator treated as sort-equal, letting the
 * sibling-chain device interpose and flip the in-chain siblings into ascending
 * order — deleting the lower index first, shifting the higher one down, and
 * silently no-op'ing the second delete so a device the user asked to remove
 * survived. This drives the real Live API end to end to prove the fix.
 *
 * Run with: npm run e2e:mcp -- ppal-delete-device-nested
 */
import { describe, expect, it } from "vitest";
import {
  createTwoPadDrumRack,
  extractToolResultText,
  parseToolResult,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface DeleteResult {
  id: string;
  type: string;
  deleted: boolean;
}

describe("ppal-delete nested rack device ordering", () => {
  it("deletes same-chain siblings and a sibling-chain device in one call", async () => {
    // Fresh MIDI track so the Drum Rack is isolated from the rest of the set.
    const track = parseToolResult<{ path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "midi" },
      }),
    );
    const t = trackIndexFromPath(track.path);

    await sleep(150);

    // Drum Rack with two pads => two chains, each with an auto-created Simpler.
    const rack = (await createTwoPadDrumRack(ctx.client!, `t${t}`)).path;

    // Append a SECOND device into pad C1's chain -> same-chain siblings (d0, d1).
    const reverb = parseToolResult<{ id: string; path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Reverb", path: `${rack}/pC1/c0/d1` },
      }),
    );

    expect(reverb.path).toBe(`${rack}/pC1/c0/d1`); // Sibling of the Simpler at d0.

    await sleep(150);

    // Resolve the three device ids by path.
    const c1d0 = await readDeviceIdByPath(`${rack}/pC1/d0`); // C1 chain, index 0
    const c1d1 = reverb.id; // C1 chain, index 1
    const d1d0 = await readDeviceIdByPath(`${rack}/pD1/d0`); // sibling chain

    // Delete in the order that trips a length-based comparator: same-chain d0,
    // then the sibling-chain device (the interposer), then same-chain d1.
    const deleted = parseToolResult<DeleteResult[]>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { id: `${c1d0}, ${d1d0}, ${c1d1}`, type: "device" },
      }),
    );

    expect(deleted).toHaveLength(3);
    expect(deleted.every((r) => r.deleted)).toBe(true);

    // Every targeted device must actually be gone — including the Reverb a buggy
    // comparator would leave alive after the index shift.
    for (const id of [c1d0, c1d1, d1d0]) {
      const read = await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: id },
      });

      expect(extractToolResultText(read).toLowerCase()).toMatch(
        /error|not found|invalid/,
      );
    }
  });

  /**
   * Read a device by path and return its id.
   * @param path - Producer Pal device path (e.g. "t3/d0/pC1/d0")
   * @returns The resolved device id
   */
  async function readDeviceIdByPath(path: string): Promise<string> {
    const device = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path },
      }),
    );

    return device.id;
  }
});

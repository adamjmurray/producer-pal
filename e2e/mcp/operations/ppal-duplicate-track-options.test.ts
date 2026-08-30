// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the ppal-duplicate track options that only real Live can prove:
 * withoutDevices, and routeToSource with its routing and arm side effects.
 * Uses: e2e-test-set (t0 Drums has a drum rack and a clip, t1 Bass has a rack)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- operations/ppal-duplicate-track-options
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface LiveSetTracks {
  tracks: Array<{ id: string; name: string }>;
}

interface DuplicateTrackResult {
  id: string;
  clips?: unknown[];
}

interface ReadTrackResult {
  id: string;
  name: string;
  deviceCount?: number;
  sessionClipCount?: number;
  isArmed?: boolean;
  inputRoutingType?: { name: string } | null;
  outputRoutingType?: { name: string } | null;
}

async function readTracks(): Promise<LiveSetTracks> {
  return parseToolResult<LiveSetTracks>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  );
}

async function readTrack(id: string): Promise<ReadTrackResult> {
  return parseToolResult<ReadTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id, include: ["routings"] },
    }),
  );
}

describe("ppal-duplicate track options", () => {
  it("copies a track without its devices but keeps the clips", async () => {
    const drums = (await readTracks()).tracks[0]!;
    const source = await readTrack(drums.id);

    expect(source.deviceCount).toBeGreaterThan(0);
    expect(source.sessionClipCount).toBeGreaterThan(0);

    const copy = parseToolResult<DuplicateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", id: drums.id, withoutDevices: true },
      }),
    );

    await sleep(100);
    const copied = await readTrack(copy.id);

    expect(copied.deviceCount).toBe(0);
    expect(copied.sessionClipCount).toBe(source.sessionClipCount);
  });

  it("routes the copy back to the source track", async () => {
    const bass = (await readTracks()).tracks[1]!;

    const { data: copy, warnings } =
      parseToolResultWithWarnings<DuplicateTrackResult>(
        await ctx.client!.callTool({
          name: "ppal-duplicate",
          arguments: { type: "track", id: bass.id, routeToSource: true },
        }),
      );

    await sleep(100);
    const copied = await readTrack(copy.id);

    // The copy is a bare MIDI feeder: no instrument of its own, nothing to play.
    expect(copied.deviceCount).toBe(0);
    expect(copied.sessionClipCount).toBe(0);
    // Live's own routing list is what makes this work, so the name it reports
    // back is the only proof the copy actually reaches the source track.
    expect(copied.outputRoutingType?.name).toBe(bass.name);

    const source = await readTrack(bass.id);

    expect(source.isArmed).toBe(true);
    expect(source.inputRoutingType?.name).toBe("No Input");

    expect(warnings.join("\n")).toContain("Armed the source track");
    expect(warnings.join("\n")).toContain('to "No Input"');
  });

  it("refuses routeToSource for anything but a track", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "scene", id: "0", routeToSource: true },
    });

    expect(JSON.stringify(result)).toContain(
      "routeToSource is only supported for type 'track'",
    );
  });
});

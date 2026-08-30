// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests that treat return and master tracks as real targets, not just as
 * the error case. Live gives them their own LOM paths and drops properties a
 * regular track has, so reads, mixer writes and device work all take a
 * different route through the Live API.
 * Uses: e2e-test-set (rt0 A-Delay/Echo, rt1 B-Reverb, master has 3 devices)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- track/ppal-return-and-master-tracks
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface TrackSummary {
  id: string;
  name: string;
}

interface ReadTrackResult {
  id: string;
  name: string;
  type: string;
  color?: string;
  gainDb?: number;
  devices?: Array<{ id: string; name: string; type: string; path: string }>;
  inputRoutingType?: unknown;
  availableInputRoutingTypes?: unknown[];
}

async function readReturnTracks(): Promise<TrackSummary[]> {
  const result = parseToolResult<{ returnTracks: TrackSummary[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  );

  return result.returnTracks;
}

async function readTrack(
  args: Record<string, unknown>,
): Promise<ReadTrackResult> {
  return parseToolResult<ReadTrackResult>(
    await ctx.client!.callTool({ name: "ppal-read-track", arguments: args }),
  );
}

describe("return and master tracks", () => {
  it("reads a return track's devices", async () => {
    const rt0 = await readTrack({
      trackType: "return",
      trackIndex: 0,
      include: ["devices"],
    });

    expect(rt0.type).toBe("return");
    expect(rt0.name).toBe("A-Delay");
    expect(rt0.devices![0]!.type).toBe("audio-effect: Echo");
    expect(rt0.devices![0]!.path).toBe("rt0/d0");
  });

  it("reads a device on a return track by path", async () => {
    const device = parseToolResult<{ path: string; type: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: "rt0/d0" },
      }),
    );

    expect(device.path).toBe("rt0/d0");
    expect(device.type).toContain("Echo");
  });

  it("creates and deletes a device on a return track", async () => {
    const created = parseToolResult<{ id: string; deviceIndex: number }>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Compressor", path: "rt1" },
      }),
    );

    await sleep(100);

    const device = parseToolResult<{ path: string; type: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: created.id },
      }),
    );

    expect(device.path).toBe(`rt1/d${created.deviceIndex}`);
    expect(device.type).toContain("Compressor");

    await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { type: "device", ids: created.id },
    });
    await sleep(100);

    const after = await readTrack({
      trackType: "return",
      trackIndex: 1,
      include: ["devices"],
    });

    expect(after.devices!.some((d) => d.id === created.id)).toBe(false);
  });

  it("writes a return track's mixer", async () => {
    const rt0 = (await readReturnTracks())[0]!;
    const before = await readTrack({
      trackType: "return",
      trackIndex: 0,
      include: ["color"],
    });

    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: rt0.id, color: "#00FF00", gainDb: -12 },
    });
    await sleep(100);

    const after = await readTrack({
      trackType: "return",
      trackIndex: 0,
      include: ["mixer", "color"],
    });

    // Live snaps to its own palette, so only the change is assertable
    expect(after.color).not.toBe(before.color);
    expect(after.gainDb).toBeCloseTo(-12, 1);
  });

  it("renames a return track without doubling its send letter", async () => {
    const rt0 = (await readReturnTracks())[0]!;

    // Live prepends the send letter on every write, so writing back the name
    // read-track reported would come out "A-A-Delay".
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: rt0.id, name: rt0.name },
    });
    await sleep(100);

    expect((await readReturnTracks())[0]!.name).toBe(rt0.name);

    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: rt0.id, name: "Tape" },
    });
    await sleep(100);

    expect((await readReturnTracks())[0]!.name).toBe("A-Tape");
  });

  it("skips input routing on a return track instead of failing", async () => {
    const rt0 = (await readReturnTracks())[0]!;
    const { warnings } = parseToolResultWithWarnings<unknown>(
      await ctx.client!.callTool({
        name: "ppal-update-track",
        arguments: { id: rt0.id, inputRoutingType: "17" },
      }),
    );

    expect(warnings.join("\n")).toContain(
      "input routing is only available on regular non-group tracks",
    );
  });

  it("reads the master track's devices", async () => {
    const master = await readTrack({
      trackType: "master",
      include: ["devices"],
    });

    expect(master.type).toBe("master");
    expect(master.devices!.map((d) => d.path)).toStrictEqual([
      "mt/d0",
      "mt/d1",
      "mt/d2",
    ]);
  });

  it("writes the master track's gain", async () => {
    const master = await readTrack({ trackType: "master" });

    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: master.id, gainDb: -3 },
    });
    await sleep(100);

    const after = await readTrack({ trackType: "master", include: ["mixer"] });

    expect(after.gainDb).toBeCloseTo(-3, 1);
  });
});

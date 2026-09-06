// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for the warning an input path raises when it names a drum chain by
 * its rack-relative index (`cN`) instead of the pad-relative spelling
 * (`pNote/cN`) results always use.
 *
 * The warning has to fire against a real Drum Rack and stay quiet on a plain
 * one — the chain's `type` is what tells them apart, and a mock can say
 * anything, so this drives both against real Live.
 *
 * Run with: npm run e2e:mcp -- ppal-drum-chain-rack-relative-warning
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import { createTrackWithDrumRack } from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("rack-relative drum chain spelling", () => {
  it("warns with the pad spelling when a path names a drum chain rack-relatively", async () => {
    const { rackPath } = await createTrackWithDrumRack(ctx.client!);

    const { warnings } = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Utility", path: `${rackPath}/c0` },
      }),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`${rackPath}/pC1/c0`);
    expect(warnings[0]).toContain("preferred spelling");
  });

  it("stays quiet for the pad-relative spelling", async () => {
    const { rackPath } = await createTrackWithDrumRack(ctx.client!);

    const { warnings } = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Utility", path: `${rackPath}/pC1/c0` },
      }),
    );

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for a chain under a plain, non-drum rack", async () => {
    const trackIndex = await createMidiTrack(ctx.client!);
    const rackPath = await createTestDeviceAt(
      ctx.client!,
      "Instrument Rack",
      `t${trackIndex}`,
    );

    const { warnings } = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Operator", path: `${rackPath}/c0` },
      }),
    );

    expect(warnings).toStrictEqual([]);
  });
});

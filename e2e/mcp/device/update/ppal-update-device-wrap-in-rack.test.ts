// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-device wrapInRack.
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-wrap-in-rack
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface WrapResult {
  id: string;
  path?: string;
  type: string;
  deviceCount: number;
}

describe("ppal-update-device wrapInRack", () => {
  it("wraps a single instrument and reports its path", async () => {
    const trackIndex = await createMidiTrack(ctx.client!);
    const devicePath = await createTestDeviceAt(
      ctx.client!,
      "Operator",
      `t${trackIndex}`,
    );

    const result = parseToolResult<WrapResult>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: devicePath, wrapInRack: true },
      }),
    );

    expect(result.type).toBe("instrument-rack");
    expect(result.deviceCount).toBe(1);
    expect(result.path).toBe(devicePath);
  });

  // A wrap makes one rack for the whole call, so a wrap that can't happen has
  // no entry to report on and fails outright.
  it("refuses to wrap MIDI and audio effects into one rack", async () => {
    const trackIndex = await createMidiTrack(ctx.client!);
    const arp = await createTestDeviceAt(
      ctx.client!,
      "Arpeggiator",
      `t${trackIndex}`,
    );
    const comp = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${trackIndex}`,
    );

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `${arp},${comp}`, wrapInRack: true },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "wrapInRack cannot mix MIDI and audio effects in one rack",
    );
    expect(getToolWarnings(result)).toStrictEqual([]);
  });

  it("refuses a wrap whose toPath names nothing", async () => {
    const trackIndex = await createMidiTrack(ctx.client!);
    const devicePath = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${trackIndex}`,
    );

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: devicePath, wrapInRack: true, toPath: "t99/d3" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain('nothing at toPath "t99/d3"');
    expect(getToolWarnings(result)).toStrictEqual([]);

    // The device stayed where it was.
    expect(
      parseToolResult<{ path?: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path: devicePath },
        }),
      ).path,
    ).toBe(devicePath);
  });

  it("refuses to wrap two instruments from different tracks into one rack", async () => {
    const trackA = await createMidiTrack(ctx.client!);
    const trackB = await createMidiTrack(ctx.client!);
    const deviceA = await createTestDeviceAt(
      ctx.client!,
      "Operator",
      `t${trackA}`,
    );
    const deviceB = await createTestDeviceAt(
      ctx.client!,
      "Operator",
      `t${trackB}`,
    );

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `${deviceA},${deviceB}`, wrapInRack: true },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "wrapInRack can wrap only one instrument at a time",
    );

    // Neither instrument should have moved.
    expect(
      parseToolResult<{ path?: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path: deviceA },
        }),
      ).path,
    ).toBe(deviceA);
    expect(
      parseToolResult<{ path?: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path: deviceB },
        }),
      ).path,
    ).toBe(deviceB);
  });
});

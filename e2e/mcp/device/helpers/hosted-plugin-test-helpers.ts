// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the E2E suites for hosted plug-ins share.

import {
  createMidiTrack,
  type McpTestContext,
  parseToolResult,
  sleep,
} from "../../mcp-test-helpers";

/** A duplicated wrapper restores its plug-in a moment after it appears. */
const RESTORE_MS = 3000;

export interface HostedDevice {
  id: string;
  path: string;
  type: string;
  hosted?: boolean;
  name?: string;
  parameters?: { id: string; name: string; value?: string }[];
}

/**
 * Tool-calling helpers for a suite of hosted plug-ins.
 * @param ctx - The suite's MCP test context
 * @returns Helpers that call tools, host a plug-in, read it and duplicate it
 */
export function hostedPluginHelpers(ctx: McpTestContext) {
  /**
   * Call a tool and parse its result.
   * @param name - Tool name
   * @param args - Tool args
   * @returns The parsed result
   */
  async function call<T>(name: string, args: Record<string, unknown>) {
    return parseToolResult<T>(
      await ctx.client!.callTool({ name, arguments: args }),
    );
  }

  /**
   * Host a plug-in at the end of a new MIDI track.
   * @param deviceName - The plug-in's name in Live's browser
   * @param extra - More create-device args
   * @returns The track index and the device's path
   */
  async function hostOnNewTrack(
    deviceName: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ track: number; path: string }> {
    const track = await createMidiTrack(ctx.client!);
    const created = await call<{ path: string }>("ppal-create-device", {
      deviceName,
      hosted: true,
      path: `t${track}/d+`,
      ...extra,
    });

    return { track, path: created.path };
  }

  /**
   * Read a device's params whose names match.
   * @param path - The device's path
   * @param paramSearch - Name filter
   * @returns The device
   */
  function readDevice(path: string, paramSearch?: string) {
    return call<HostedDevice>("ppal-read-device", {
      path,
      ...(paramSearch && { include: ["param-values"], paramSearch }),
    });
  }

  /**
   * Duplicate a track and wait for its wrappers to restore their plug-ins.
   * @param track - Track index
   * @returns The copy's path
   */
  async function duplicateTrack(track: number): Promise<string> {
    const copy = await call<{ path: string }>("ppal-duplicate", {
      type: "track",
      path: `t${track}`,
    });

    await sleep(RESTORE_MS);

    return copy.path;
  }

  return { call, hostOnNewTrack, readDevice, duplicateTrack };
}

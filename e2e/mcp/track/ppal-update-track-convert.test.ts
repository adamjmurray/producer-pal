// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for update-track's `convert`: a track's devices go onto a pad of a
 * new Drum Rack, on a new track. It needs the Producer Pal remote script.
 *
 * The tests share one Live session, and the first one runs before any track is
 * added: it names the test Set's grouped track by index.
 *
 * Run with: npm run e2e:mcp -- track/ppal-update-track-convert
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDevice,
  getToolErrorMessage,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../device/helpers/remote-script-test-helpers.ts";

interface Entry {
  id: string;
  path?: string;
  detail?: string;
  converted?: {
    track: { id: string; path: string; name: string };
    sourceRemoved?: boolean;
  };
}

interface DeviceRead {
  type: string;
}

/** The test Set's "Child": no clips, and the only track in its group. */
const ONLY_CHILD = "t10";
/** The test Set's "Lead": a Drift and a Compressor, with clips. */
const WITH_CLIPS = "t3";
/** The test Set's empty MIDI track. */
const NO_DEVICES = "t8";

describe.skipIf(!REMOTE_SCRIPT_E2E)("update-track convert", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext({ once: true });

  /**
   * Call update-track.
   * @param args - Its arguments
   * @returns The raw tool result
   */
  function update(args: Record<string, unknown>): Promise<unknown> {
    return ctx.client!.callTool({ name: "ppal-update-track", arguments: args });
  }

  /**
   * The type of the device at a path.
   * @param path - The device's path
   * @returns Its type
   */
  async function deviceType(path: string): Promise<string> {
    const device = parseToolResult<DeviceRead>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path },
      }),
    );

    return device.type;
  }

  it("refuses the track Live would crash on, and Live keeps running", async () => {
    const refused = await update({ path: ONLY_CHILD, convert: "drum-rack" });

    expect(getToolErrorMessage(refused)).toContain(
      "not converted: Live can't convert a track with no clips that is the only track in its group",
    );

    // Still answering, and the track is still there with its instrument.
    expect(await deviceType(`${ONLY_CHILD}/d0`)).toContain("instrument");
  });

  it("refuses a track with no devices, a group track and a return track", async () => {
    expect(
      getToolErrorMessage(
        await update({ path: NO_DEVICES, convert: "drum-rack" }),
      ),
    ).toContain("not converted: the track has no devices");
    expect(
      getToolErrorMessage(await update({ path: "t9", convert: "drum-rack" })),
    ).toContain("not converted: a group track has no devices to convert");
    expect(
      getToolErrorMessage(await update({ path: "rt0", convert: "drum-rack" })),
    ).toContain("not converted: only a regular track can be converted");
  });

  it("keeps the other edits when the conversion is refused", async () => {
    const entry = parseToolResult<Entry>(
      await update({ path: NO_DEVICES, mute: true, convert: "drum-rack" }),
    );

    expect(entry.path).toBe(NO_DEVICES);
    expect(entry.detail).toContain("not converted: the track has no devices");
    expect(entry.converted).toBeUndefined();

    await update({ path: NO_DEVICES, mute: false });
  });

  it("keeps a track that has clips, and puts the new track right after it", async () => {
    const entry = parseToolResult<Entry>(
      await update({ path: WITH_CLIPS, convert: "drum-rack" }),
    );

    expect(entry.path).toBe(WITH_CLIPS);
    expect(entry.detail).toBeUndefined();
    expect(entry.converted?.track.path).toBe("t4");
    expect(entry.converted?.sourceRemoved).toBeUndefined();

    await sleep(150);

    expect(await deviceType("t4/d0")).toContain("drum-rack");
    // The devices are on pad C1, and the source still has its own.
    expect(await deviceType("t4/d0/pC1/d0")).toContain("instrument");
    expect(await deviceType(`${WITH_CLIPS}/d0`)).toContain("instrument");
  });

  it("says when Live removed a track that had no clips", async () => {
    const index = await createMidiTrack(ctx.client!);

    await createTestDevice(ctx.client!, "Operator", `t${index}`);
    await update({ path: `t${index}`, name: "No Clips" });

    const entry = parseToolResult<Entry>(
      await update({ path: `t${index}`, convert: "drum-rack" }),
    );

    expect(entry.path).toBeUndefined();
    expect(entry.detail).toContain("Live removed it");
    expect(entry.converted?.sourceRemoved).toBe(true);
    // The new track takes the old one's place and name.
    expect(entry.converted?.track).toStrictEqual(
      expect.objectContaining({ path: `t${index}`, name: "No Clips" }),
    );
    expect(entry.converted?.track.id).not.toBe(entry.id);

    await sleep(150);

    expect(await deviceType(`t${index}/d0`)).toContain("drum-rack");
  });
});

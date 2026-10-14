// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-update-clip `convert`: an audio clip becomes a new track
 * with an instrument and a MIDI clip of the detected notes, through the remote
 * script. Each test deletes the tracks it made.
 *
 * Uses: e2e-test-set — audio clips at t4/s0 and t5/s0, an arrangement audio clip
 * at t4@17|1, and a MIDI clip at t0/s0.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/remote-script/ppal-update-clip-convert
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { readClipFully } from "../helpers/clip-io-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";

/** An update-clip entry that converted a clip. */
interface Converted {
  id?: string;
  path?: string;
  detail?: string;
  converted?: {
    track: { id: string; name?: string };
    instrument?: { id?: string; path?: string; type?: string };
    clip?: { path?: string; noteCount: number };
  };
}

/**
 * The new track is named, and holds an instrument of the expected type.
 * @param converted - The entry's `converted`
 * @param type - The instrument's device type
 */
const expectTrackAndInstrument = (
  converted: Converted["converted"],
  type: string,
) => {
  expect(converted?.track.name).toStrictEqual(expect.any(String));
  expect(converted?.instrument).toStrictEqual(
    expect.objectContaining({
      id: expect.any(String),
      path: expect.stringMatching(/^t\d+\/d\d+$/),
      type,
    }),
  );
};

describe.skipIf(!REMOTE_SCRIPT_E2E)("ppal-update-clip — convert", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  const update = async (args: Record<string, unknown>) =>
    await ctx.client!.callTool({ name: "ppal-update-clip", arguments: args });

  /** Delete tracks a test made, so the Set is as it was. */
  const deleteTracks = async (...entries: Array<Converted>) => {
    const ids = entries.flatMap((entry) =>
      entry.converted == null ? [] : [entry.converted.track.id],
    );

    await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { id: ids.join(","), type: "track" },
    });
    await sleep(100);
  };

  it("drums: a MIDI track with a Drum Rack and a clip in the same slot", async () => {
    const result = parseToolResult<Converted>(
      await update({ path: "t4/s0", convert: "drums" }),
    );
    const converted = result.converted!;

    try {
      expect(converted.track.id).toStrictEqual(expect.any(String));
      expectTrackAndInstrument(converted, "drum-rack");
      expect(converted.clip?.path).toMatch(/^t\d+\/s0$/);
      expect(converted.clip?.noteCount).toStrictEqual(expect.any(Number));
      // The new track may sit before the source, which moves the source's path.
      expect(result.path).toMatch(/^t\d+\/s0$/);
    } finally {
      await deleteTracks(result);
    }
  });

  it("melody: reports the clip even when Live finds no notes", async () => {
    const result = parseToolResult<Converted>(
      await update({ path: "t5/s0", convert: "melody" }),
    );

    try {
      expectTrackAndInstrument(result.converted, "instrument-rack");
      expect(result.converted?.clip).toStrictEqual(
        expect.objectContaining({ noteCount: expect.any(Number) }),
      );
    } finally {
      await deleteTracks(result);
    }
  });

  it("converts an arrangement clip to a clip at the same start", async () => {
    const result = parseToolResult<Converted>(
      await update({ path: "t4[17|1]", convert: "harmony" }),
    );

    try {
      expectTrackAndInstrument(result.converted, "instrument-rack");
      expect(result.converted?.clip?.path).toMatch(/^t\d+\[17\|1\]$/);
    } finally {
      await deleteTracks(result);
    }
  });

  it("converts the clip as the same call edited it", async () => {
    const result = parseToolResult<Converted>(
      await update({
        path: "t4/s0",
        name: "converted source",
        convert: "drums",
      }),
    );

    try {
      expect(result.converted?.track.id).toStrictEqual(expect.any(String));
    } finally {
      await deleteTracks(result);
    }
  });

  it("converts each clip of a call, one entry each", async () => {
    const results = parseToolResult<Converted[]>(
      await update({ path: "t4/s0,t5/s0", convert: "drums" }),
    );

    try {
      expect(results).toHaveLength(2);
      expect(results[0]?.converted?.track.id).not.toBe(
        results[1]?.converted?.track.id,
      );
    } finally {
      await deleteTracks(...results);
    }
  });

  // The second clip's new track lands ahead of the first clip, so the first
  // clip's path moves. It was untouched, so it must not read as overwritten.
  it("keeps both entries when a later conversion shifts an earlier clip's path", async () => {
    // Its current length, so arrangementLength asks for the write and changes nothing.
    const { arrangementLength } = await readClipFully(ctx.client!, {
      path: "t4[17|1]",
    });
    const results = parseToolResult<Converted[]>(
      await update({
        path: "t5/s0,t4[17|1]",
        convert: "drums",
        arrangementLength,
      }),
    );

    try {
      expect(results).toHaveLength(2);

      for (const entry of results) {
        expect(entry.id).toStrictEqual(expect.any(String));
        expect(entry.detail ?? "").not.toContain("overwritten");
      }

      // The entry's path is where the clip is now, not where it was written.
      const session = await readClipFully(ctx.client!, { id: results[0]!.id! });

      expect(results[0]?.path).toBe(session.path);
    } finally {
      await deleteTracks(...results);
    }
  });

  it("refuses a MIDI clip, changing nothing", async () => {
    const result = await update({ path: "t0/s0", convert: "drums" });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "only an audio clip can be converted",
    );
  });

  it("refuses beside a split", async () => {
    const result = await update({
      path: "t4[17|1]",
      convert: "drums",
      arrangementSplit: "19|1",
    });

    expect(getToolErrorMessage(result)).toContain(
      "convert cannot be combined with arrangementSplit",
    );
  });

  it("refuses without the remote script, saying how to set it up", async () => {
    await setConfig({ remoteScriptEnabled: false });
    await sleep(50);

    const result = await update({ path: "t4/s0", convert: "drums" });

    expect(getToolErrorMessage(result)).toContain(
      "converting a clip needs the Producer Pal remote script",
    );
  });
});

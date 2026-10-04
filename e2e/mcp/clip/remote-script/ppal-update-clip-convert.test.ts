// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip `convert`: an audio clip becomes a new track
 * (MIDI clip of the detected notes, Simpler, or Drum Rack) through the remote
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
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";

/** An update-clip entry that converted a clip. */
interface Converted {
  path?: string;
  converted?: {
    track: { id: string };
    clip?: { path?: string; noteCount: number };
  };
}

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

  it("drums: a MIDI track with a clip in the same slot", async () => {
    const result = parseToolResult<Converted>(
      await update({ path: "t4/s0", convert: "drums" }),
    );
    const converted = result.converted!;

    try {
      expect(converted.track.id).toStrictEqual(expect.any(String));
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
      expect(result.converted?.clip).toStrictEqual(
        expect.objectContaining({ noteCount: expect.any(Number) }),
      );
    } finally {
      await deleteTracks(result);
    }
  });

  it("simpler and drum-rack: a track and no clip", async () => {
    const simpler = parseToolResult<Converted>(
      await update({ path: "t4/s0", convert: "simpler" }),
    );

    try {
      expect(simpler.converted?.track.id).toStrictEqual(expect.any(String));
      expect(simpler.converted?.clip).toBeUndefined();
    } finally {
      await deleteTracks(simpler);
    }

    const rack = parseToolResult<Converted>(
      await update({ path: "t4/s0", convert: "drum-rack" }),
    );

    try {
      expect(rack.converted?.track.id).toStrictEqual(expect.any(String));
      expect(rack.converted?.clip).toBeUndefined();
    } finally {
      await deleteTracks(rack);
    }
  });

  it("converts an arrangement clip to a clip at the same start", async () => {
    const result = parseToolResult<Converted>(
      await update({ path: "t4[17|1]", convert: "harmony" }),
    );

    try {
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
        convert: "simpler",
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
      await update({ path: "t4/s0,t5/s0", convert: "simpler" }),
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

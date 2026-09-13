// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the params ppal-update-clip can do nothing with on a given
 * clip. Each one is a reason on that clip's own entry, never a warning, and a
 * skip where it was all the call asked for.
 *
 * Uses: e2e-test-set - t8 (empty MIDI track) plus audio tracks it creates
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-ignored-params
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-update-clip ignored params", () => {
  // A param the clip can do nothing with belongs on that clip's entry, not in a
  // warning: the model reads the entry.
  it("reports an ignored param on the clip's own entry", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s26`, {
      notes: "C3 1|1",
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, looping: false, firstStart: "2|1" },
    });
    const { data, warnings } =
      parseToolResultWithWarnings<ReadClipResult>(result);

    // looping landed, so the ignored firstStart is a reason on a real entry.
    expect(data.reason).toContain(
      "firstStart ignored: the clip is not looping",
    );
    expect(warnings.join(" ")).not.toContain("firstStart");
  });

  // Nothing else was asked of the one clip named, so the reason comes back as
  // the error rather than an entry nobody can pair against a list.
  it("refuses a lone clip whose only param it can do nothing with", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Lone Refusal Track" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    await sleep(100);

    const clipId = await createClipInSlot(ctx, `${track.path}/s0`, {
      sampleFile: SAMPLE_FILE,
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, notes: "C3 1|1" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "notes ignored: the clip is audio",
    );
  });

  // A split is work that landed, so every piece keeps its entry even when the
  // only other param was one the clip could do nothing with. Without that the
  // pieces collapse onto the one target they share, and the call throws after
  // the clip has already been cut.
  it("keeps every piece of a split whose other param the clip ignored", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Split Reason Track" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    await sleep(100);

    const created = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `${track.path}[1|1]`, sampleFile: SAMPLE_FILE },
    });
    const clip = parseToolResult<ReadClipResult>(created);

    await sleep(100);

    // One beat in, so any sample of at least two beats splits in two.
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clip.id, arrangementSplit: "1|2", quantize: 1 },
    });
    const { data, warnings } =
      parseToolResultWithWarnings<ReadClipResult[]>(result);

    expect(data).toHaveLength(2);

    for (const entry of data) {
      expect(entry).not.toHaveProperty("ok");
      expect(entry.reason).toContain("quantize ignored: the clip is audio");
    }

    expect(warnings.join(" ")).not.toContain("quantize");
  });
});

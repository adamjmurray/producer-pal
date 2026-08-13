// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for create-clip warning about params that don't apply to the clip
 * type it was asked to make.
 *
 * These params are dropped rather than applied, so the warning is the only sign
 * the request wasn't honored — and it only counts if it survives the MCP round
 * trip as a WARNING block. Real Live is what shows the drop actually landed:
 * the clip keeps the sample's own region instead of the length that was asked
 * for.
 *
 * Uses: e2e-test-set - t5 "Audio 2" (free slots), t8 "9-MIDI" (empty)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-create-clip-ignored-params
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  DRUM_LOOP_FILE,
  parseToolResult,
  parseToolResultWithWarnings,
  readClipWithNotes,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  AUDIO_WARP_TRACK,
  readClipFully,
} from "../helpers/audio-warp-test-helpers.ts";

const ctx = setupMcpTestContext();

/** t8 "9-MIDI" is empty in e2e-test-set. */
const MIDI_TRACK = 8;

/**
 * Create the same unwarped drum loop with no timing params, as a control.
 * @param scene - The scene index to create it in
 * @returns The clip as read back
 */
async function createPlainDrumLoop(scene: number): Promise<ReadClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      sampleFile: DRUM_LOOP_FILE,
      slot: `${AUDIO_WARP_TRACK}/${scene}`,
      warping: false,
    },
  });
  const created = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return readClipFully(ctx.client!, created.id);
}

describe("ppal-create-clip with params for the other clip type", () => {
  it("warns that MIDI-only timing params are dropped on an audio clip", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        sampleFile: DRUM_LOOP_FILE,
        slot: `${AUDIO_WARP_TRACK}/1`,
        warping: false,
        start: "1|3",
        length: "2bar",
        looping: true,
      },
    });
    const created = parseToolResultWithWarnings<CreateClipResult>(result);

    expect(created.warnings.join("\n")).toContain(
      "start, length, looping ignored for audio clips",
    );

    await sleep(100);

    const clip = await readClipFully(ctx.client!, created.data.id);
    const control = await createPlainDrumLoop(2);

    // Same region as a clip created with none of those params: the whole
    // sample from its head, not the two bars starting at beat 3 that were
    // asked for.
    expect(clip.length).toBe(control.length);
    expect(clip.start).toBe(control.start);
  });

  it("doesn't even parse a dropped param on an audio clip", async () => {
    // A param that's being ignored must not still be able to fail the call.
    // "2|3" is a position, not a duration, so parsing it as a length throws.
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        sampleFile: DRUM_LOOP_FILE,
        slot: `${AUDIO_WARP_TRACK}/3`,
        warping: false,
        length: "2|3",
      },
    });
    const created = parseToolResultWithWarnings<CreateClipResult>(result);

    expect(created.warnings.join("\n")).toContain(
      "length ignored for audio clips",
    );
    expect(created.data.id).toBeDefined();
  });

  it("warns that warping is dropped on a MIDI clip", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${MIDI_TRACK}/7`,
        notes: "C3 1|1",
        warping: false,
      },
    });
    const created = parseToolResultWithWarnings<CreateClipResult>(result);

    expect(created.warnings.join("\n")).toContain(
      "warping ignored for MIDI clips",
    );

    await sleep(100);

    const clip = await readClipWithNotes(ctx.client!, created.data.id);

    // Warned, not refused: the clip is still there.
    expect(clip.type).toBe("midi");
    expect(clip.notes).toContain("C3");
  });
});

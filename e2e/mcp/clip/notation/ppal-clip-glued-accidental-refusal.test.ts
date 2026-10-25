// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E for an accidental written after the octave (`A3b`, meant as Ab3): Stark,
 * bar|beat and transforms must refuse it with the fix named and write nothing,
 * and the refusal must reach the model in the tool result. The same pitch in a
 * comment must not take over another error's hint.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track; slot /0 stays empty.
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-glued-accidental-refusal
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  createClipTransformHelpers,
  restoreNotationAfterAll,
} from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes } = createClipTransformHelpers(ctx);

restoreNotationAfterAll();

const SLOT = `t${EMPTY_MIDI_TRACK}/s0`;

describe("ppal-create-clip: accidental after the octave", () => {
  it.each([
    [
      "bar|beat",
      "barbeat",
      "C3 A3b 1|1",
      "the accidental goes right after the letter — write Ab3",
    ],
    [
      "bar|beat sharp",
      "barbeat",
      "A3# 1|1",
      "the accidental goes right after the letter — write A#3",
    ],
    [
      "bar|beat, a glued pitch only in a comment",
      "barbeat",
      "C3 [D3 // A3b",
      'unclosed "[" — add the missing "]"',
    ],
    [
      "Stark",
      "stark",
      "melody: G3 A3b Bb3",
      "the accidental goes right after the letter — write Ab3",
    ],
    [
      "Stark octave mark",
      "stark",
      "melody: G E'b C",
      "write Eb' for a flat, or E' b for two notes",
    ],
  ] as const)(
    "refuses it in %s and names the fix",
    async (_name, notation, notes, message) => {
      await setConfig({ notation });

      const result = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path: SLOT, notes },
      });

      await sleep(100);

      // Not the quoted token: the result may carry it JSON-escaped.
      expect(getToolErrorMessage(result)).toContain(message);

      const track = parseToolResult<{ sessionClipCount: number }>(
        await ctx.client!.callTool({
          name: "ppal-read-track",
          arguments: { path: `t${EMPTY_MIDI_TRACK}` },
        }),
      );

      expect(track.sessionClipCount).toBe(0);
    },
  );
});

describe("ppal-update-clip: accidental after the octave in a transform", () => {
  it("refuses it and leaves the notes alone", async () => {
    const clipId = await createMidiClip(0, "A3 C4 1|1");
    const before = await readClipNotes(clipId);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, transforms: "A3#: velocity = 1" },
    });

    expect(getToolErrorMessage(result)).toContain(
      "the accidental goes right after the letter — write A#3",
    );

    await sleep(100);

    expect(await readClipNotes(clipId)).toBe(before);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for how ppal-update-clip reads bar|beat input over MCP: what it
 * accepts, and what the model is told when it can't parse it.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-notation-input
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { updateAndRead } from "../helpers/clip-io-test-helpers.ts";
import { createClipTransformHelpers } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes } = createClipTransformHelpers(ctx);

describe("ppal-update-clip bar|beat input", () => {
  it("reads a trailing dot as a whole beat in start", async () => {
    const clipId = await createMidiClip(0, "C3 1|1");

    const { clip } = await updateAndRead(ctx.client!, clipId, {
      start: "1|2.",
    });

    expect(clip.start).toBe("1|2");
  });

  it("reads a trailing dot as a whole beat in notes", async () => {
    const clipId = await createMidiClip(1, "C3 1|1");

    await updateAndRead(ctx.client!, clipId, { notes: "D3 1|3." });

    expect(await readClipNotes(clipId)).toContain("D3 1|3");
  });
});

describe("ppal-update-clip bar|beat parse errors", () => {
  // A model reads the parse error to repair its notes, so the error must name
  // the fix — and the clip stays as it was.
  it.each([
    ["a note missing its octave", "E 1|2", "a note needs an octave: E3, not E"],
    [
      "a bad value before a # comment, with a sharp earlier",
      "C#3 v8.5#loud 1|2",
      'Got "v8.5".',
    ],
  ])(
    "names the fix for %s and leaves the notes alone",
    async (_name, notes, hint) => {
      const clipId = await createMidiClip(2, "C3 1|1");
      const before = await readClipNotes(clipId);

      const result = await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: clipId, notes },
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(hint);

      await sleep(100);

      expect(await readClipNotes(clipId)).toBe(before);
    },
  );

  it("keeps the whole position in the spaced-pipe fix", async () => {
    const clipId = await createMidiClip(3, "C3 1|1");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, notes: "E3 1 | 1x4@n/4,3.5" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("write 1|1x4@n/4,3.5");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for Live 13's step sequencer clips. Live's notes API reaches only a
 * hidden note list on one: reads never show its steps, and writes "succeed"
 * while changing nothing. So a read says what the clip is, note work on it is
 * ignored with a reason, and a copy that would rebuild it from its notes is
 * skipped (Live's API can't create one). Copies Live makes itself keep it.
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * Uses: live-13-test, t0 (s0 "Step Sequencer", s1 "Notes"). See
 * e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-step-sequencer-clips
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  type SkippedTargetResult,
  type UpdateClipResult,
} from "../../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../../e2e-test-set.ts";

const STEP = "t0/s0";
const NOTES = "t0/s1";
const REASON = "the clip is a step sequencer";
const NO_REBUILD =
  "it's a step sequencer clip, and Live's API can't create one";
/** What s1 holds, spelled as a write: C1 on each beat, a sixteenth long. */
const NOTES_AS_WRITTEN = "v100 n/16 C1 1|1,2,3,4";

describe.skipIf(!LIVE_13_OR_NEWER)("step sequencer clips (Live 13)", () => {
  const ctx = setupMcpTestContext({
    once: true,
    liveSetPath: LIVE_13_TEST_PATH,
  });

  /**
   * Call a tool and parse its result.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns The parsed result
   */
  async function call<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    return parseToolResult<T>(
      await ctx.client!.callTool({ name, arguments: args }),
    );
  }

  /**
   * Call a tool that is refused and return what it said.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns The error message
   */
  async function refusal(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    return getToolErrorMessage(
      await ctx.client!.callTool({ name, arguments: args }),
    );
  }

  /**
   * Read a clip with its notes and timing.
   * @param path - Producer Pal path or id of the clip
   * @returns The clip
   */
  async function readClip(path: string): Promise<ReadClipResult> {
    return await call<ReadClipResult>("ppal-read-clip", {
      ...(/^t\d/.test(path) ? { path } : { id: path }),
      include: ["notes", "timing"],
    });
  }

  /**
   * Delete a clip a test made.
   * @param id - The clip's id
   */
  async function deleteClip(id: string): Promise<void> {
    await call("ppal-delete", { type: "clip", id });
  }

  describe("reads", () => {
    it("shows the step sequencer clip as its own type, with no notes", async () => {
      const clip = await readClip(STEP);

      expect(clip.type).toBe("step-sequencer");
      expect(clip.detail).toBe("steps can't be read");
      expect(clip.name).toBe("Step Sequencer");
      expect(clip.length).toBe("1bar");
      expect(clip.notes).toBeUndefined();
      expect(clip.mutedNotes).toBeUndefined();
    });

    it("still reads the notes clip beside it", async () => {
      const clip = await readClip(NOTES);

      expect(clip.type).toBe("midi");
      expect(clip.detail).toBeUndefined();
      expect(clip.notes).toContain("C1");
    });

    it("lists both on the track, the type shown only for the one that isn't the track's", async () => {
      const track = await call<{
        sessionClips: Array<{ name?: string; type?: string; detail?: string }>;
      }>("ppal-read-track", { path: "t0", include: ["session-clips"] });
      const [step, notes] = track.sessionClips;

      expect(step).toStrictEqual(
        expect.objectContaining({
          name: "Step Sequencer",
          type: "step-sequencer",
          detail: "steps can't be read",
        }),
      );
      expect(notes?.name).toBe("Notes");
      expect(notes?.type).toBeUndefined();
    });
  });

  describe("note work on it is ignored, and changes nothing", () => {
    it.each([
      ["notes", { notes: "C1 1|1" }],
      ["transforms", { transforms: "velocity = 50" }],
      ["preTransforms", { preTransforms: "velocity = 50" }],
      ["quantize", { quantize: 1, quantizeGrid: "1/8" }],
      ["duplicateLoop", { duplicateLoop: true }],
    ])("%s", async (param, args) => {
      const message = await refusal("ppal-update-clip", {
        path: STEP,
        ...args,
      });

      expect(message).toContain(param);
      expect(message).toContain(`ignored: ${REASON}`);

      const clip = await readClip(STEP);

      expect(clip.type).toBe("step-sequencer");
      expect(clip.length).toBe("1bar");
      expect(clip.notes).toBeUndefined();
    });

    it("lands the name beside a notes edit that is ignored", async () => {
      try {
        const result = await call<UpdateClipResult>("ppal-update-clip", {
          path: STEP,
          name: "Renamed Step Sequencer",
          notes: "C1 1|1",
        });

        expect(result.detail).toBe(`notes ignored: ${REASON}`);
        expect((await readClip(STEP)).name).toBe("Renamed Step Sequencer");
      } finally {
        await call("ppal-update-clip", { path: STEP, name: "Step Sequencer" });
      }
    });

    it("lands a scale on it, and it stays a step sequencer clip", async () => {
      try {
        const result = await call<UpdateClipResult>("ppal-update-clip", {
          path: STEP,
          scale: "D Minor",
        });

        expect(result.detail).toBeUndefined();
        expect(result.scale).toBeUndefined();

        const clip = await call<ReadClipResult>("ppal-read-clip", {
          path: STEP,
          include: ["*"],
        });

        expect(clip.scale).toBe("D Minor");
        expect(clip.type).toBe("step-sequencer");
      } finally {
        // The Set's own scale; a read omits a clip scale equal to it.
        await call("ppal-update-clip", { path: STEP, scale: "A Minor" });
      }
    });

    it("writes the notes clip and ignores the step sequencer one in the same call", async () => {
      const results = await call<Array<UpdateClipResult | SkippedTargetResult>>(
        "ppal-update-clip",
        { path: `${STEP},${NOTES}`, notes: NOTES_AS_WRITTEN },
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toStrictEqual(
        expect.objectContaining({
          ok: false,
          detail: `notes ignored: ${REASON}`,
        }),
      );
      expect(results[1]).toStrictEqual(
        expect.objectContaining({ noteCount: 4 }),
      );
    });
  });

  describe("copies", () => {
    it("copies to another slot and stays a step sequencer clip", async () => {
      const copy = await call<{ id: string; path: string }>("ppal-duplicate", {
        type: "clip",
        path: STEP,
        toPath: "t0/s2",
      });

      try {
        expect(copy.path).toBe("t0/s2");
        expect((await readClip(copy.id)).type).toBe("step-sequencer");
      } finally {
        await deleteClip(copy.id);
      }
    });

    it("copies to the arrangement and stays one; moves that rebuild it are skipped", async () => {
      const copy = await call<{ id: string; path: string }>("ppal-duplicate", {
        type: "clip",
        path: STEP,
        toPath: "t0[1|1]",
      });

      try {
        expect((await readClip(copy.id)).type).toBe("step-sequencer");

        // To a take lane, to a slot: each would rebuild it from its notes.
        for (const toPath of ["t0/l0[9|1]", "t0/s3"]) {
          const message = await refusal("ppal-update-clip", {
            id: copy.id,
            toPath,
          });

          expect(message).toContain(NO_REBUILD);
          expect((await readClip(copy.id)).type).toBe("step-sequencer");
        }
      } finally {
        await deleteClip(copy.id);
      }
    });

    it("skips a copy onto a take lane, and the clip is still there", async () => {
      const message = await refusal("ppal-duplicate", {
        type: "clip",
        path: STEP,
        toPath: "t0/l0[1|1]",
      });

      expect(message).toContain(NO_REBUILD);
      expect((await readClip(STEP)).type).toBe("step-sequencer");
    });
  });
});

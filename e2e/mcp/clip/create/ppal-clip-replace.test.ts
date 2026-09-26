// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for writing a clip over one that is already there. A slot's clip is
 * replaced by building the new one in an empty slot on the same track and
 * copying it over, so a create Live refuses leaves the old clip. When the track
 * has no empty slot, a scene is appended for the build and deleted afterwards.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track; t5 = audio track, only s0 filled)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-clip-replace
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  arrangementClipAt,
  readClipFully,
} from "../helpers/clip-io-test-helpers.ts";
import { AUDIO_TRACK, EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** A path Live can't load, so it refuses the create. */
const MISSING_FILE = "/nonexistent/producer-pal-e2e/missing.wav";

/**
 * How many scenes the Set holds right now.
 * @returns The scene count
 */
async function sceneCount(): Promise<number> {
  const liveSet = parseToolResult<{ scenes?: unknown[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    }),
  );

  return liveSet.scenes?.length ?? 0;
}

/**
 * Call ppal-create-clip with one destination.
 * @param args - The ppal-create-clip arguments
 * @returns The raw tool result
 */
async function create(args: Record<string, unknown>): Promise<unknown> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: args,
  });

  await sleep(100);

  return result;
}

/**
 * Put a MIDI clip in every slot of the empty MIDI track.
 * @param scenes - How many scenes the Set has
 */
async function fillMidiTrack(scenes: number): Promise<void> {
  const slots = Array.from(
    { length: scenes },
    (_, sceneIndex) => `t${EMPTY_MIDI_TRACK}/s${sceneIndex}`,
  );

  await create({ path: slots.join(","), notes: "C3 1|1" });
}

/**
 * What a refused create said: the error for a lone destination, or the entry's
 * reason.
 * @param result - The raw tool result
 * @returns The message
 */
function refusal(result: unknown): string {
  if (isToolError(result)) {
    return getToolErrorMessage(result);
  }

  const entry = parseToolResultWithWarnings<{ ok?: false; detail?: string }>(
    result,
  ).data;

  expect(entry.ok).toBe(false);

  return entry.detail ?? "";
}

describe("replacing a clip on a track with no empty slot", () => {
  it("create-clip replaces it and leaves the scenes as they were", async () => {
    const scenes = await sceneCount();

    await fillMidiTrack(scenes);

    const entry = parseToolResult<CreateClipResult>(
      await create({
        path: `t${EMPTY_MIDI_TRACK}/s0`,
        name: "Replaced",
        notes: "E3 1|1",
      }),
    );

    expect(entry.detail).toBe(
      `overwrote the existing clip at t${EMPTY_MIDI_TRACK}/s0`,
    );
    expect(await sceneCount()).toBe(scenes);

    const slot = await readClipFully(ctx.client!, {
      path: `t${EMPTY_MIDI_TRACK}/s0`,
    });

    expect(slot.id).toBe(entry.id);
    expect(slot.name).toBe("Replaced");
    expect(slot.notes).toContain("E3");
  });

  it.each(["ppal-update-clip", "ppal-duplicate"])(
    "%s re-creates an arrangement clip over it",
    async (tool) => {
      const scenes = await sceneCount();

      await fillMidiTrack(scenes);

      const source = parseToolResult<CreateClipResult>(
        await create({
          path: `t${EMPTY_MIDI_TRACK}[17|1]`,
          name: "Takes Over",
          notes: "G3 1|1",
          length: "1bar",
        }),
      );
      const args =
        tool === "ppal-duplicate"
          ? { type: "clip", id: source.id }
          : { id: source.id };
      const result = await ctx.client!.callTool({
        name: tool,
        arguments: { ...args, toPath: `t${EMPTY_MIDI_TRACK}/s4` },
      });

      await sleep(100);

      const { data: placed } = parseToolResultWithWarnings<{
        id: string;
        detail?: string;
      }>(result);

      expect(placed.detail).toContain(
        `overwrote the existing clip at t${EMPTY_MIDI_TRACK}/s4`,
      );
      expect(await sceneCount()).toBe(scenes);

      const slot = await readClipFully(ctx.client!, {
        path: `t${EMPTY_MIDI_TRACK}/s4`,
      });

      expect(slot.id).toBe(placed.id);
      expect(slot.name).toBe("Takes Over");
      expect(slot.notes).toContain("G3");
    },
  );
});

describe("a create Live refuses over an existing clip", () => {
  it("leaves the slot's clip and the spare slot it built in", async () => {
    const scenes = await sceneCount();
    const before = await readClipFully(ctx.client!, {
      path: `t${AUDIO_TRACK}/s0`,
    });

    const message = refusal(
      await create({ path: `t${AUDIO_TRACK}/s0`, sampleFile: MISSING_FILE }),
    );

    expect(message).toContain(
      `Live created no clip at t${AUDIO_TRACK}/s0 from sampleFile "${MISSING_FILE}"; ` +
        `the clip at t${AUDIO_TRACK}/s0 was not touched`,
    );
    expect(await sceneCount()).toBe(scenes);

    const after = await readClipFully(ctx.client!, {
      path: `t${AUDIO_TRACK}/s0`,
    });

    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);

    // The build slot is the first empty one on the track, and is emptied again.
    const spare = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${AUDIO_TRACK}/s1` },
    });

    expect(getToolErrorMessage(spare)).toContain(
      `no clip at t${AUDIO_TRACK}/s1`,
    );
  });

  it("leaves the slot's clip on a track with no empty slot", async () => {
    const scenes = await sceneCount();
    const before = await readClipFully(ctx.client!, {
      path: `t${AUDIO_TRACK}/s0`,
    });
    const rest = Array.from(
      { length: scenes - 1 },
      (_, index) => `t${AUDIO_TRACK}/s${index + 1}`,
    );

    await create({ path: rest.join(","), sampleFile: SAMPLE_FILE });

    const message = refusal(
      await create({ path: `t${AUDIO_TRACK}/s0`, sampleFile: MISSING_FILE }),
    );

    expect(message).toContain(`the clip at t${AUDIO_TRACK}/s0 was not touched`);
    expect(await sceneCount()).toBe(scenes);
    expect(
      (await readClipFully(ctx.client!, { path: `t${AUDIO_TRACK}/s0` })).id,
    ).toBe(before.id);
  });

  it("leaves an arrangement clip at the same position", async () => {
    const original = parseToolResult<CreateClipResult>(
      await create({ path: `t${AUDIO_TRACK}[1|1]`, sampleFile: SAMPLE_FILE }),
    );

    expect(
      refusal(
        await create({
          path: `t${AUDIO_TRACK}[1|1]`,
          sampleFile: MISSING_FILE,
        }),
      ),
    ).toContain(
      `Live created no clip at t${AUDIO_TRACK}[1|1] from sampleFile "${MISSING_FILE}"`,
    );

    expect((await arrangementClipAt(ctx.client!, AUDIO_TRACK, "1|1"))?.id).toBe(
      original.id,
    );
  });
});

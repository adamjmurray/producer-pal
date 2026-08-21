// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for switching `looping` on ppal-update-clip.
 *
 * Live keeps two regions per clip and `looping` picks which one plays:
 * start_marker/end_marker while it is off, loop_start/loop_end while it is on.
 * Flipping the flag does not carry the region across — it reveals whatever the
 * other pair was last left with, which for a fresh clip is the whole thing. So
 * a bare `looping` used to resize the clip, silently, in both directions.
 *
 * These tests pin that `looping` changes the loop flag and nothing else. They
 * need real Live: the swap is Live's own behavior, not ours, and no mock
 * reproduces it.
 *
 * Uses: e2e-test-set - t8 "9-MIDI" (empty) and t5 "Audio 2" (free slots)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-loop-toggle
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  DRUM_LOOP_FILE,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

/** t8 "9-MIDI": an empty MIDI track. */
const MIDI_TRACK = 8;
/** t5 "Audio 2": an audio track with free slots and an empty arrangement. */
const AUDIO_TRACK = 5;

/**
 * Half of the one-bar drum loop, and of the one-bar MIDI clips here. Short
 * enough that a region reset to the whole clip is unmistakable.
 */
const HALF = "n/2";
const WHOLE = "1bar";

/**
 * Create a clip and read it back.
 * @param client - The MCP client
 * @param args - ppal-create-clip arguments
 * @returns The new clip's id
 */
async function create(
  client: Client,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({
    name: "ppal-create-clip",
    arguments: args,
  });
  const created = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return created.id;
}

/**
 * Update a clip and read it back.
 * @param client - The MCP client
 * @param clipId - The clip to update
 * @param args - ppal-update-clip arguments, merged over the clip id
 * @returns The clip as read back, and any warnings the update reported
 */
async function updateAndRead(
  client: Client,
  clipId: string,
  args: Record<string, unknown>,
): Promise<{ clip: ReadClipResult; warnings: string[] }> {
  const result = await client.callTool({
    name: "ppal-update-clip",
    arguments: { ids: clipId, ...args },
  });
  const { warnings } = parseToolResultWithWarnings<unknown>(result);

  await sleep(100);

  const read = await client.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["*"] },
  });

  return { clip: parseToolResult<ReadClipResult>(read), warnings };
}

/**
 * A one-bar clip of the given kind, cut down to its first half and left not
 * looping — the state a bare `looping: true` used to reset to the whole bar.
 * @param client - The MCP client
 * @param kind - Whether to build a MIDI clip or an audio one
 * @param sceneIndex - The clip slot to build it in
 * @returns The new clip's id
 */
async function halvedClip(
  client: Client,
  kind: "midi" | "audio",
  sceneIndex: number,
): Promise<string> {
  const clipId = await create(client, {
    path: `t${kind === "midi" ? MIDI_TRACK : AUDIO_TRACK}/s${sceneIndex}`,
    name: `loop toggle ${kind}`,
    ...(kind === "midi"
      ? { length: WHOLE, notes: "C3 1|1 E3 1|3" }
      : { sampleFile: DRUM_LOOP_FILE, warping: true }),
  });

  const { clip } = await updateAndRead(client, clipId, {
    looping: false,
    start: "1|1",
    length: HALF,
  });

  expect(clip.length).toBe(HALF);
  expect(clip.looping).toBe(false);

  return clipId;
}

describe("ppal-update-clip loop toggle", () => {
  it.each(["midi", "audio"] as const)(
    "keeps the region when looping switches on (%s)",
    async (kind) => {
      const clipId = await halvedClip(ctx.client!, kind, 1);

      const { clip } = await updateAndRead(ctx.client!, clipId, {
        looping: true,
      });

      expect(clip.looping).toBe(true);
      // Without the restatement Live reveals the loop brace it remembers, which
      // on a clip this fresh is the whole bar.
      expect(clip.length).toBe(HALF);
      expect(clip.start).toBe("1|1");
    },
  );

  it.each(["midi", "audio"] as const)(
    "keeps the region when looping switches off (%s)",
    async (kind) => {
      const clipId = await halvedClip(ctx.client!, kind, 2);

      await updateAndRead(ctx.client!, clipId, { looping: true });

      const { clip } = await updateAndRead(ctx.client!, clipId, {
        looping: false,
      });

      expect(clip.looping).toBe(false);
      expect(clip.length).toBe(HALF);
      expect(clip.start).toBe("1|1");
    },
  );

  it("round trips without drifting", async () => {
    const clipId = await halvedClip(ctx.client!, "midi", 3);

    for (const looping of [true, false, true, false]) {
      const { clip } = await updateAndRead(ctx.client!, clipId, { looping });

      expect(clip.looping).toBe(looping);
      expect(clip.length).toBe(HALF);
    }
  });

  it("lets start and length in the same call win over the old region", async () => {
    // Preservation is a fallback for the region the caller left unspecified,
    // not an override of one they did specify.
    const clipId = await halvedClip(ctx.client!, "midi", 4);

    const { clip } = await updateAndRead(ctx.client!, clipId, {
      looping: true,
      start: "1|1",
      length: WHOLE,
    });

    expect(clip.looping).toBe(true);
    expect(clip.length).toBe(WHOLE);
  });

  it("derives an omitted start from the region that is playing now", async () => {
    // `length` without `start` reads the clip's current start. That has to come
    // from the pair playing before the flip, not the one `looping` now selects.
    const clipId = await halvedClip(ctx.client!, "midi", 5);

    const { clip } = await updateAndRead(ctx.client!, clipId, {
      looping: true,
      length: HALF,
    });

    expect(clip.looping).toBe(true);
    expect(clip.start).toBe("1|1");
    expect(clip.length).toBe(HALF);
  });

  it("keeps the loop brace, not the first pass, when looping switches off", async () => {
    // An offset loop has two starts: the brace (`start`) and the first pass
    // (`firstStart`). A non-looping clip has no first pass, so the brace is the
    // region that survives — and it is what read-clip was already reporting as
    // `start`/`length`.
    const clipId = await create(ctx.client!, {
      path: `t${MIDI_TRACK}/s6`,
      name: "offset loop",
      length: "2bar",
      notes: "C3 1|1 E3 2|1",
    });

    const offset = await updateAndRead(ctx.client!, clipId, {
      looping: true,
      start: "1|1",
      length: WHOLE,
      firstStart: "1|3",
    });

    expect(offset.clip.start).toBe("1|1");
    expect(offset.clip.length).toBe(WHOLE);
    expect(offset.clip.firstStart).toBe("1|3");

    const { clip } = await updateAndRead(ctx.client!, clipId, {
      looping: false,
    });

    expect(clip.looping).toBe(false);
    expect(clip.start).toBe("1|1");
    expect(clip.length).toBe(WHOLE);
  });

  it("keeps the region of an arrangement clip", async () => {
    const clipId = await create(ctx.client!, {
      path: `t${AUDIO_TRACK}`,
      arrangementStart: "97|1",
      sampleFile: DRUM_LOOP_FILE,
      name: "loop toggle arrangement",
      warping: true,
    });

    await updateAndRead(ctx.client!, clipId, {
      looping: false,
      start: "1|1",
      length: HALF,
    });

    const looped = await updateAndRead(ctx.client!, clipId, { looping: true });

    expect(looped.clip.looping).toBe(true);
    expect(looped.clip.length).toBe(HALF);

    const unlooped = await updateAndRead(ctx.client!, clipId, {
      looping: false,
    });

    expect(unlooped.clip.length).toBe(HALF);
  });

  it("keeps the region of an unwarped audio clip", async () => {
    // The originally reported case. An unwarped clip holds its markers in
    // seconds, and `looping: true` forces warping back on, so the region
    // crosses a unit switch on its way into the loop brace.
    const clipId = await create(ctx.client!, {
      sampleFile: DRUM_LOOP_FILE,
      path: `t${AUDIO_TRACK}/s3`,
      name: "loop toggle unwarped",
      warping: false,
    });

    const shortened = await updateAndRead(ctx.client!, clipId, {
      start: "1|1",
      length: HALF,
    });

    expect(shortened.clip.warping).toBe(false);
    expect(shortened.clip.length).toBe(HALF);

    const { clip } = await updateAndRead(ctx.client!, clipId, {
      looping: true,
    });

    expect(clip.looping).toBe(true);
    expect(clip.warping).toBe(true);
    expect(clip.length).toBe(HALF);
  });

  it("keeps the region when looping: true vetoes warping: false", async () => {
    // The veto skips the unwarp rather than letting it run and be overridden.
    // That is observable here: the unwarp resets end_marker to the whole
    // sample, and the region preserved into the loop brace would come from
    // those reset markers.
    const clipId = await create(ctx.client!, {
      sampleFile: DRUM_LOOP_FILE,
      path: `t${AUDIO_TRACK}/s4`,
      name: "loop toggle veto",
      warping: true,
    });

    await updateAndRead(ctx.client!, clipId, {
      looping: false,
      start: "1|1",
      length: HALF,
    });

    const { clip, warnings } = await updateAndRead(ctx.client!, clipId, {
      looping: true,
      warping: false,
    });

    expect(warnings.join("\n")).toContain("warping: false ignored");
    expect(clip.looping).toBe(true);
    expect(clip.warping).toBe(true);
    expect(clip.length).toBe(HALF);
  });
});

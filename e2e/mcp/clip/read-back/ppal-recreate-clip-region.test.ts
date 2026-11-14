// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the region a re-created clip keeps.
 *
 * Live can't copy a clip onto a take lane, off one, or from the arrangement
 * into a session slot, so those copies and moves build a new clip and write the
 * source's loop brace and markers onto it. Each pair of start/end writes is
 * ordered on its own, so a start can be written while the other pair's end is
 * still short of it. Whether Live takes that is its own rule, which only real
 * Live answers: every route here must hand back the region the source had.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track; its slots and arrangement are free)
 *
 * Run with: npm run e2e:mcp -- clip/read-back/ppal-recreate-clip-region
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseToolResultWithWarnings,
  setConfig,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  createArrangementClip,
  readClipFully,
  updateClip,
} from "../helpers/clip-io-test-helpers.ts";
import {
  addRawNote,
  arrangementSpanBeats,
  type ClipRegion,
  readEveryNote,
  readRegion,
  shapeRegion,
} from "../helpers/clip-region-test-helpers.ts";

// The source and its lane stay put between tests (take lanes can't be removed),
// so every test takes its own stretch of the arrangement and its own slot.
const ctx = setupMcpTestContext({ once: true });

beforeEach(async () => {
  await setConfig({ liveApiEnabled: true });
});

/** Where a route puts its copy. */
interface Destination {
  /** The source's bar, and a free bar for the copy */
  sourceBar: number;
  copyBar: number;
  /** A free clip slot */
  slot: number;
}

/** One way a clip gets re-created, from a source living in `home`. */
interface Route {
  name: string;
  home: "main lane" | "take lane";
  /** Re-creates the clip and returns the new clip's id */
  run: (sourceId: string, to: Destination) => Promise<string>;
}

const TRACK = `t${EMPTY_MIDI_TRACK}`;

/**
 * Copy a clip with ppal-duplicate.
 * @param id - The clip to copy
 * @param toPath - Where the copy goes
 * @returns The copy's id
 */
async function duplicateTo(id: string, toPath: string): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-duplicate",
    arguments: { type: "clip", id, toPath },
  });

  // A take lane made on the way adds a warning about the hidden lane.
  return parseToolResultWithWarnings<{ id: string }>(result).data.id;
}

/**
 * Move a clip with ppal-update-clip.
 * @param id - The clip to move
 * @param toPath - Where it goes
 * @returns The id of the clip at the new place
 */
async function moveTo(id: string, toPath: string): Promise<string> {
  const { data } = await updateClip(ctx.client!, id, { toPath });

  return data.id!;
}

const ROUTES: Route[] = [
  {
    name: "copied onto a take lane",
    home: "main lane",
    run: (id, to) => duplicateTo(id, `${TRACK}/l0[${to.copyBar}|1]`),
  },
  {
    name: "moved onto a take lane",
    home: "main lane",
    run: (id) => moveTo(id, `${TRACK}/l0`),
  },
  {
    name: "copied into a session slot",
    home: "main lane",
    run: (id, to) => duplicateTo(id, `${TRACK}/s${to.slot}`),
  },
  {
    name: "moved into a session slot",
    home: "main lane",
    run: (id, to) => moveTo(id, `${TRACK}/s${to.slot}`),
  },
  {
    name: "copied from a take lane to the main lane",
    home: "take lane",
    run: (id, to) => duplicateTo(id, `${TRACK}[${to.copyBar}|1]`),
  },
  {
    name: "moved from a take lane to the main lane",
    home: "take lane",
    run: (id, to) => moveTo(id, `${TRACK}[${to.copyBar}|1]`),
  },
];

let nextBar = 101;
let nextSlot = 0;

/**
 * Take a free stretch of arrangement for a test, and a slot for the routes that
 * need one. Slots run out after the scenes the Set has, so only slot routes
 * take one.
 * @param route - The route about to run
 * @returns Where the test's source and copy go
 */
function destinationFor(route: Route): Destination {
  const sourceBar = nextBar;

  nextBar += 8;

  return {
    sourceBar,
    copyBar: sourceBar + 4,
    slot: route.name.includes("slot") ? nextSlot++ : 0,
  };
}

/**
 * Make the MIDI clip a test starts from.
 * @param route - The route that will re-create it
 * @param to - Where the test's clip goes
 * @param length - How long the clip is
 * @returns The clip's id
 */
async function makeSource(
  route: Route,
  to: Destination,
  length = "2bar",
): Promise<string> {
  const { id } = await createArrangementClip(
    ctx.client!,
    EMPTY_MIDI_TRACK,
    `${to.sourceBar}|1`,
    {
      name: "Region Source",
      length,
      laneSuffix: route.home === "take lane" ? "/l0" : "",
    },
  );

  return id;
}

describe("re-created clip keeps a left trim", () => {
  it.each(ROUTES)("$name", async (route) => {
    const to = destinationFor(route);
    const sourceId = await makeSource(route, to);

    // Trim the front off the 2-bar clip: it starts on beat 3, ends at 3|1.
    await updateClip(ctx.client!, sourceId, {
      looping: false,
      start: "1|3",
      length: "1bar+n/2",
    });

    const source = await readClipFully(ctx.client!, { id: sourceId });

    expect(source.looping).toBe(false);
    expect(source.start).toBe("1|3");
    expect(source.end).toBe("3|1");

    const before = await readRegion(ctx.client!, sourceId);
    const copyId = await route.run(sourceId, to);

    expect(await readRegion(ctx.client!, copyId)).toStrictEqual(before);
  });
});

// The loop and the markers sit apart: playback starts at 5, inside loop 2..6,
// and the clip ends at 6. Each pair's writes are ordered without looking at the
// other pair, so a start can be written past the other pair's current end.
const APART: ClipRegion = {
  looping: true,
  loop_start: 2,
  loop_end: 6,
  start_marker: 5,
  end_marker: 6,
};

describe("re-created clip keeps a loop apart from its markers", () => {
  // A copy starts as long as the source's span, and its ends start there. With
  // a span under the start marker (4 < 5), start_marker is written while the
  // loop brace still ends at 4.
  const SPANS = [
    { length: "2bar", name: "a span past the markers" },
    { length: "1bar", name: "a span short of the start marker" },
  ];

  describe.each(SPANS)("with $name", ({ length }) => {
    it.each(ROUTES)("$name", async (route) => {
      const to = destinationFor(route);
      const sourceId = await makeSource(route, to, length);

      await shapeRegion(ctx.client!, sourceId, APART);

      // The short-span case only tests anything if Live left the clip short.
      if (length === "1bar") {
        expect(
          await arrangementSpanBeats(ctx.client!, sourceId),
          "setup: Live lengthened the source on the timeline",
        ).toBeLessThanOrEqual(APART.start_marker);
      }

      const copyId = await route.run(sourceId, to);

      expect(await readRegion(ctx.client!, copyId)).toStrictEqual(APART);
    });
  });
});

// A looping clip's end_marker can sit far past loop_end, with a note out there
// that never plays. Reads and edits leave it alone; a re-create must still carry
// it, and the end_marker that keeps it in the clip.
const FAR_END: ClipRegion = {
  looping: true,
  loop_start: 0,
  loop_end: 4,
  start_marker: 0,
  end_marker: 16,
};
const BEAT_PAST_LOOP_END = 10;

describe("re-created clip keeps a note past loop_end", () => {
  it.each(ROUTES)("$name", async (route) => {
    const to = destinationFor(route);
    const sourceId = await makeSource(route, to, "4bar");

    await addRawNote(ctx.client!, sourceId, {
      pitch: 72,
      start: BEAT_PAST_LOOP_END,
      duration: 1,
    });
    await shapeRegion(ctx.client!, sourceId, FAR_END);

    const before = await readEveryNote(ctx.client!, sourceId);

    // The chord the source starts with, inside the loop, and the added note.
    expect(before.map((note) => note.start_time)).toContain(BEAT_PAST_LOOP_END);
    expect(before.some((note) => note.start_time === 0)).toBe(true);

    const copyId = await route.run(sourceId, to);

    expect(await readEveryNote(ctx.client!, copyId)).toStrictEqual(before);
    expect((await readRegion(ctx.client!, copyId)).end_marker).toBe(16);
  });
});

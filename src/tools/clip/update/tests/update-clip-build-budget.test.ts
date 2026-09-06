// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Build budgets for updating a batch of clips in one call.
//
// Renaming or recoloring a whole scene's worth of clips is the ordinary
// expensive call. A clip is reached by id, so nothing above it — track, slot,
// scene — has any reason to be built; what these pin is that it stays that way,
// and that the per-clip cost is flat.
//
// They count resolutions rather than asserting output, so a new repeat shows up
// as a number that moved. A correctness test cannot see repeated work.

import { describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

/** Clips in the batch. */
const CLIPS = 4;

/** The ids the call names, in order. */
const IDS = Array.from({ length: CLIPS }, (_, i) => `10${String(i)}`);

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

/** The Live Set, holding the meter and scale every clip update reads. */
function registerLiveSet(): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      scale_mode: 0,
    },
  });
}

/** The properties a MIDI clip answers during an update. */
const MIDI_CLIP_PROPERTIES = {
  is_audio_clip: 0,
  is_midi_clip: 1,
  looping: 1,
  signature_numerator: 4,
  signature_denominator: 4,
  start_marker: 0,
  end_marker: 4,
  loop_start: 0,
  loop_end: 4,
};

/** CLIPS session clips down track 0's slots. */
function setupSessionClips(): void {
  registerLiveSet();

  for (const [i, id] of IDS.entries()) {
    registerMockObject(id, {
      path: livePath.track(0).clipSlot(i).clip(),
      type: "Clip",
      properties: { ...MIDI_CLIP_PROPERTIES, is_arrangement_clip: 0 },
    });
  }
}

/** CLIPS arrangement clips along track 0, one per bar. */
function setupArrangementClips(): void {
  registerLiveSet();

  for (const [i, id] of IDS.entries()) {
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(i),
      type: "Clip",
      properties: {
        ...MIDI_CLIP_PROPERTIES,
        is_arrangement_clip: 1,
        start_time: i * 4,
        end_time: i * 4 + 4,
      },
    });
  }
}

/** Track 1, with an empty slot facing each of the session clips. */
function setupMoveDestination(): void {
  registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: { has_midi_input: 1, is_frozen: 0 },
  });

  for (let i = 0; i < CLIPS; i++) {
    registerMockObject(`live_set/tracks/0/clip_slots/${String(i)}`, {
      path: livePath.track(0).clipSlot(i),
      properties: { has_clip: 1 },
    });
    registerMockObject(`live_set/tracks/1/clip_slots/${String(i)}`, {
      path: livePath.track(1).clipSlot(i),
      properties: { has_clip: 0 },
    });
  }
}

/**
 * Run the batch inside a request scope, the way the V8 adapter runs every tool
 * call. Values derived once per request are only remembered while one is open.
 * @param call - The tool call to make
 */
async function inRequestScope(call: () => Promise<unknown>): Promise<void> {
  beginLiveApiScope();

  try {
    await call();
  } finally {
    endLiveApiScope();
  }
}

describe("updateClip build budget", () => {
  it("builds one object per clip and nothing above it", async () => {
    setupSessionClips();

    await updateClip({ id: IDS.join(","), name: "Renamed", color: "#FF0000" });

    // One resolution per id: the clip the call writes to.
    expect(resolves("id *")).toBe(CLIPS);

    // An id names a clip outright, so a property write needs nothing else. The
    // move budget below resolves both of these, so a zero here means this path
    // skipped them rather than that the shape is unreachable.
    expect(resolves("live_set tracks *")).toBe(0);
    expect(resolves("live_set tracks * clip_slots *")).toBe(0);

    // One clip per id, and that is the whole call.
    expect(liveApiBuildStats().resolved).toBe(CLIPS);
  });

  it("leaves the Live Set alone when the call edits no notes", async () => {
    setupSessionClips();

    await updateClip({ id: IDS.join(","), name: "Renamed" });

    // The Set's scale reaches a call only through the transform context, which
    // carries the variables a transform reads (clip.*, bar.*) and the mask
    // snap()/step() quantize against. A rename asks for none of it, so the
    // context isn't built and nothing here touches the Set at all.
    //
    // These are resolutions, not constructions: live_set is a stable target, so
    // the reads this removes were memo hits plus their property gets. The
    // destination track below is the half that saves real object builds.
    expect(resolves("live_set")).toBe(0);
  });

  it("reads the Live Set's scale once per clip that edits notes", async () => {
    setupSessionClips();

    await updateClip({ id: IDS.join(","), notes: "1|1 C3" });

    // The other side of the skip above: notes mean a context per clip, and the
    // context carries the scale mask. Still one read per clip — the scale is
    // the same for the whole batch, so this could be one.
    expect(resolves("live_set")).toBe(CLIPS);
  });

  it("shares the song meter across an arrangement batch", async () => {
    setupArrangementClips();

    await inRequestScope(() =>
      updateClip({ id: IDS.join(","), name: "Renamed" }),
    );

    // An arrangement clip is named by its bar|beat, which costs the song
    // meter, and that name gets built three times per clip: twice for warning
    // labels the call goes on to not warn with, once for the result's path.
    // The meter is memoized per request, so all of it collapses to this one.
    // A session clip pays none of it — its path is spelled from indices
    // already in hand.
    //
    // The scope is the point. Every tool call runs inside one, so a count
    // taken without a scope measures the harness rather than what ships.
    expect(resolves("live_set")).toBe(1);
  });

  it("resolves the destination track once for the whole batch moved into it", async () => {
    setupSessionClips();
    setupMoveDestination();

    await updateClip({
      id: IDS.join(","),
      toPath: Array.from({ length: CLIPS }, (_, i) => `t1/s${String(i)}`).join(
        ",",
      ),
    });

    // Every clip in the batch lands on the same track, and each one asks that
    // track whether it takes the copy. The batch resolves it once and passes
    // it down, so the count is the number of destination tracks, not clips.
    expect(resolves("live_set tracks *")).toBe(1);

    // Two slots per clip: the one it leaves and the one it lands in.
    expect(resolves("live_set tracks * clip_slots *")).toBe(CLIPS * 2);

    // Two reads of a destination's clip: the batch checks up front that no
    // destination holds a clip it also updates, and the copy then reads back
    // what landed.
    expect(resolves("live_set tracks * clip_slots * clip")).toBe(CLIPS * 2);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { z } from "zod";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { toolDefCreateClip } from "#src/tools/clip/create/create-clip.def.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";
import {
  registerArrangementTrack,
  setupArrangementClipMocks,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

// A caller that sends every param, filling the ones it has no value for with
// null, must not be read as having named t0/s0. z.coerce.number() turns both a
// null and a blank into 0, so this goes through the schema the tool registers,
// not straight to the handler.
describe("createClip location params through the tool schema", () => {
  const params = resolveToolSchema(
    toolDefCreateClip.toolOptions.inputSchema,
    {},
  ).validating;

  it("refuses a null trackIndex/sceneIndex instead of filling t0/s0", async () => {
    const raw = { trackIndex: null, sceneIndex: null };
    const args = z.object(params).parse(unsetEmptyParams(raw, params));

    expect(args.trackIndex).toBeUndefined();
    expect(args.sceneIndex).toBeUndefined();
    await expect(createClip(args)).rejects.toThrow("path is required");
  });

  // A blank is refused where the null is dropped: a number has no empty value,
  // so a caller sending one meant something and the call can't guess what.
  it("refuses a blank trackIndex outright", () => {
    expect(() =>
      unsetEmptyParams({ trackIndex: "", sceneIndex: "" }, params),
    ).toThrow("trackIndex: a blank string is not a value for this param.");
  });
});

describe("createClip path param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session clip from a slot path", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({ path: "t0/s0", notes: "C3 1|1" });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
  });

  it("creates an arrangement clip from a bare track path plus arrangementStart", async () => {
    const { track } = setupArrangementClipMocks();

    await createClip({ path: "t0", arrangementStart: "1|1", notes: "C3 1|1" });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
  });

  // Preserves what slot + trackIndex + arrangementStart could already do: one
  // call filling a clip slot and dropping an arrangement clip.
  it("creates session and arrangement clips from one mixed path", async () => {
    setupArrangementClipMocks();
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    registerArrangementTrack(1);

    const result = (await createClip({
      path: "t0/s0,t1",
      arrangementStart: "1|1",
      notes: "C3 1|1",
    })) as object[];

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(result).toHaveLength(2);
  });

  // Impossible before path: trackIndex was a single number, so one call could
  // only ever reach one track's arrangement.
  it("creates arrangement clips on several tracks in one call", async () => {
    setupArrangementClipMocks();
    registerArrangementTrack(1);

    const result = (await createClip({
      path: "t0,t1",
      arrangementStart: "1|1",
      notes: "C3 1|1",
    })) as object[];

    expect(result).toHaveLength(2);
  });

  // A short track list used to cycle, so two tracks against four positions
  // silently made four clips. It pairs now: the positions with no track of
  // their own get nothing, and the caller is told which.
  // It never cycled — only two clips were made, for four positions asked for.
  // Now the uneven call is refused before any of them is created.
  it("refuses uneven tracks and positions", async () => {
    setupArrangementClipMocks();
    registerArrangementTrack(1);

    await expect(
      createClip({
        path: "t0,t1",
        arrangementStart: "1|1,2|1,3|1,4|1",
        notes: "C3 1|1",
      }),
    ).rejects.toThrow(
      "path names 2 entries but arrangementStart names 4 entries.",
    );
  });

  it("rejects a destination no clip can occupy", async () => {
    await expect(createClip({ path: "rt0" })).rejects.toThrow(
      'invalid path "rt0" - return and main tracks have no clips; ' +
        'clips go to a track ("t0"), a take lane on it ("t0/l0"), or a clip slot ("t0/s1")',
    );
  });

  // The grammar bounds no index, so "t99" parses fine and every tool leans on
  // a downstream existence check. Without mockNonExistentObjects the mock says
  // yes to any path, and this question never gets asked.
  it("rejects a well-formed path that points at no track", async () => {
    mockNonExistentObjects();

    await expect(
      createClip({ path: "t99/s0", notes: "C3 1|1" }),
    ).rejects.toThrow("track 99 does not exist");
    await expect(
      createClip({ path: "t99", arrangementStart: "1|1", notes: "C3 1|1" }),
    ).rejects.toThrow("track 99 does not exist");
  });

  // A take lane names one place, unlike a bare track — but still not a spot on
  // it. The error echoes back the lane the caller wrote, l+ included.
  it("rejects a take-lane path with no position on it", async () => {
    await expect(
      createClip({ path: "t0/l+", notes: "C3 1|1" }),
    ).rejects.toThrow(
      'path "t0/l+" names no position; ' +
        'add one, as "t0/l+[5|1]"; take lanes hold arrangement clips',
    );
    await expect(
      createClip({ path: "t0/l1", notes: "C3 1|1" }),
    ).rejects.toThrow('path "t0/l1" names no position;');
  });

  // A model writes the word instead of leaving the param out. Counting it as a
  // destination refused a call that named exactly one.
  it("creates at the slot when path is a coerced null", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({ path: "null", slot: "0/0", notes: "C3 1|1" });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(consoleMock.warn).toHaveBeenCalledWith('path "null" names nothing');
  });

  it("refuses path and slot together rather than picking one", async () => {
    await expect(createClip({ path: "t0/s0", slot: "1/1" })).rejects.toThrow(
      "path and slot both name a destination",
    );
  });
});

describe("createClip trackIndex/sceneIndex fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The whole point of the alias: a model that guesses these two gets the clip
  // it asked for instead of an error and a second round trip.
  it("reads trackIndex + sceneIndex as a clip slot", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({ trackIndex: 0, sceneIndex: 0, notes: "C3 1|1" });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
  });

  // A slot that names nothing is not a destination, so it can't shadow the
  // aliases the way a real slot list does.
  it("reads the aliases when the deprecated slot names nothing", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({
      slot: ",",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C3 1|1",
    });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(consoleMock.warn).toHaveBeenCalledWith('slot "," names nothing');
  });

  it("still reads trackIndex alone as the arrangement", async () => {
    const { track } = setupArrangementClipMocks();

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
  });

  it("rejects a sceneIndex with no track", async () => {
    await expect(createClip({ sceneIndex: 2 })).rejects.toThrow(
      'sceneIndex 2 has no track; use path "t<track>/s2"',
    );
  });

  it("ignores the aliases when path already named the destination", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({
      path: "t0/s0",
      trackIndex: 5,
      sceneIndex: 5,
      notes: "C3 1|1",
    });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('trackIndex/sceneIndex ignored — "path"'),
    );
  });

  it("ignores the aliases when the deprecated slot named the session destination", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({
      slot: "0/0",
      trackIndex: 5,
      sceneIndex: 5,
      notes: "C3 1|1",
    });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('trackIndex/sceneIndex ignored — "slot"'),
    );
  });

  // trackIndex with a slot list is today's session+arrangement combination, so
  // it only names an arrangement track when arrangementStart says where on it.
  it("ignores a trackIndex that has no arrangementStart to go with it", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({ slot: "0/0", trackIndex: 1, notes: "C3 1|1" });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("trackIndex ignored"),
    );
  });
});

describe("createClip path coordinate", () => {
  const CUE_POINTS = [{ id: "cue1", time: 32, name: "Chorus" }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an arrangement clip at the position in the path", async () => {
    const { track } = setupArrangementClipMocks();

    await createClip({ path: "t0[5|1]", notes: "C3 1|1" });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 16, 4);
  });

  it("creates one clip per coordinate in the list", async () => {
    setupArrangementClipMocks();
    registerArrangementTrack(1);

    const result = (await createClip({
      path: "t0[5|1],t1[9|1]",
      notes: "C3 1|1",
    })) as object[];

    expect(result).toHaveLength(2);
  });

  it("resolves a locator inside the coordinate", async () => {
    const { track } = setupArrangementClipMocks({ cuePoints: CUE_POINTS });

    await createClip({ path: "t0[loc:Chorus]", notes: "C3 1|1" });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 32, 4);
  });

  // A create has no source to borrow the lane from, so half an address names
  // nowhere to put a clip.
  it("refuses a bare coordinate, which names no track", async () => {
    await expect(
      createClip({ path: "[5|1]", notes: "C3 1|1" }),
    ).rejects.toThrow(
      'invalid path "[5|1]" - a new clip needs a track; ' +
        'name the lane too, as "t<track>[5|1]"',
    );
  });

  // Two spellings of one position: honoring either is the silent wrong-target
  // bug the grammar exists to prevent.
  it("refuses a coordinate beside arrangementStart, naming both", async () => {
    await expect(
      createClip({ path: "t0[5|1]", arrangementStart: "9|1", notes: "C3 1|1" }),
    ).rejects.toThrow(
      'path "t0[5|1]" and arrangementStart both name a ' +
        "song position; use one",
    );
  });

  // A list of coordinates supplies a position per entry, so an entry without
  // one has nothing to fall back on.
  it("refuses a bare track sharing a list with a coordinate", async () => {
    setupArrangementClipMocks();
    registerArrangementTrack(1);

    await expect(
      createClip({ path: "t0[5|1],t1", notes: "C3 1|1" }),
    ).rejects.toThrow('path "t1" names no position;');
  });

  it("still creates a session clip beside a coordinate", async () => {
    setupArrangementClipMocks();
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    const result = (await createClip({
      path: "t0/s0,t0[5|1]",
      notes: "C3 1|1",
    })) as object[];

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(result).toHaveLength(2);
  });
});

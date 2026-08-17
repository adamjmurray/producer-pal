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

import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import {
  registerArrangementTrack,
  setupArrangementClipMocks,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

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
  // call filling a session slot and dropping an arrangement clip.
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

  // Matches duplicate: the longer list sets the count, the shorter cycles.
  it("cycles the shorter of tracks and positions", async () => {
    setupArrangementClipMocks();
    registerArrangementTrack(1);

    const result = (await createClip({
      path: "t0,t1",
      arrangementStart: "1|1,2|1,3|1,4|1",
      notes: "C3 1|1",
    })) as object[];

    expect(result).toHaveLength(4);
  });

  it("rejects a destination no clip can occupy", async () => {
    await expect(createClip({ path: "rt0" })).rejects.toThrow(
      'invalid path "rt0" - return and master tracks have no clips; ' +
        'clips go to a track ("t0"), a take lane on it ("t0/l1"), or a session slot ("t0/s1")',
    );
  });

  it("refuses path and slot together rather than picking one", async () => {
    await expect(createClip({ path: "t0/s0", slot: "1/1" })).rejects.toThrow(
      "createClip failed: path and slot both name a destination",
    );
  });
});

describe("createClip trackIndex/sceneIndex fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The whole point of the alias: a model that guesses these two gets the clip
  // it asked for instead of an error and a second round trip.
  it("reads trackIndex + sceneIndex as a session slot", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { length: 4 },
    });

    await createClip({ trackIndex: 0, sceneIndex: 0, notes: "C3 1|1" });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
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
      'createClip failed: sceneIndex 2 has no track; use path "t<track>/s2"',
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

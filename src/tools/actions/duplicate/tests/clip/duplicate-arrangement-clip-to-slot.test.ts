// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";

const SOURCE_ID = "arr_clip";
const NEW_ID = "new_clip";

interface SourceOptions {
  isMidi?: number;
  filePath?: string;
  hasEnvelopes?: number;
}

interface SlotOptions {
  trackIndex?: number;
  sceneIndex?: number;
  hasClip?: number;
  isMidiTrack?: number;
  /** Live's create call lands no clip. */
  createFails?: boolean;
  newClipId?: string;
}

/**
 * An arrangement clip on t0 to copy from.
 * @param opts - What this test varies
 */
function registerSource(opts: SourceOptions = {}): void {
  const { isMidi = 1, filePath = "", hasEnvelopes = 0 } = opts;

  mockNonExistentObjects();
  registerMockObject(SOURCE_ID, {
    path: livePath.track(0).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: isMidi,
      file_path: filePath,
      has_envelopes: hasEnvelopes,
      warping: 0,
      length: 4,
      start_marker: 0,
      loop_start: 0,
      loop_end: 4,
      end_marker: 4,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      name: "Verse",
      color: 16711680,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });
}

/**
 * A destination slot, plus its track, that builds a clip when Live's create
 * call lands one.
 * @param opts - What this test varies
 * @returns The registered slot
 */
function registerSlot(
  opts: SlotOptions = {},
): ReturnType<typeof registerMockObject> {
  const {
    trackIndex = 1,
    sceneIndex = 0,
    hasClip = 0,
    isMidiTrack = 1,
    createFails = false,
    newClipId = NEW_ID,
  } = opts;
  const slotPath = livePath.track(trackIndex).clipSlot(sceneIndex);

  const create = (): null => {
    if (!createFails) {
      registerMockObject(newClipId, { path: slotPath.clip(), type: "Clip" });
    }

    return null;
  };

  registerMockObject(`track_${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties: { has_midi_input: isMidiTrack, is_frozen: 0 },
  });

  return registerMockObject(`slot_${trackIndex}_${sceneIndex}`, {
    path: slotPath,
    type: "ClipSlot",
    properties: { has_clip: hasClip },
    methods: {
      create_clip: create,
      create_audio_clip: create,
      delete_clip: () => null,
    },
  });
}

describe("duplicate - arrangement clip to a clip slot", () => {
  it("re-creates the clip in the slot and says what it lost", async () => {
    registerSource({ hasEnvelopes: 1 });
    const slot = registerSlot();

    const result = await duplicate({
      type: "clip",
      id: SOURCE_ID,
      toPath: "t1/s0",
      name: "Copy",
    });

    expect(slot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(lookupMockObject(NEW_ID)?.set).toHaveBeenCalledWith("name", "Copy");
    expect(result).toStrictEqual({
      id: NEW_ID,
      path: "t1/s0",
      detail:
        "re-created from the arrangement clip (automation envelopes aren't copied)",
    });
  });

  it("says when the copy replaced the slot's clip, built in a temp scene", async () => {
    registerSource();

    const dest = registerSlot({ hasClip: 1 });
    const tempSlotPath = livePath.track(1).clipSlot(1);

    // t1 has no other slot free, so the copy is built in an appended scene.
    const liveSet = registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { scenes: children("s0") },
    });

    registerMockObject("temp_slot", {
      path: tempSlotPath,
      type: "ClipSlot",
      properties: { has_clip: 0 },
      methods: {
        create_clip: () => {
          registerMockObject("scratch", {
            path: tempSlotPath.clip(),
            type: "Clip",
          });

          return null;
        },
        duplicate_clip_to: () => {
          registerMockObject(NEW_ID, {
            path: livePath.track(1).clipSlot(0).clip(),
            type: "Clip",
          });

          return null;
        },
      },
    });

    const result = await duplicate({
      type: "clip",
      id: SOURCE_ID,
      toPath: "t1/s0",
    });

    expect(result).toStrictEqual({
      id: NEW_ID,
      path: "t1/s0",
      detail:
        "overwrote the existing clip at t1/s0; re-created from the arrangement clip",
    });
    expect(dest.call).not.toHaveBeenCalledWith("delete_clip");
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 1);
  });

  it("throws the reason when a lone copy fails", async () => {
    registerSource();
    registerSlot({ createFails: true });

    await expect(
      duplicate({ type: "clip", id: SOURCE_ID, toPath: "t1/s0" }),
    ).rejects.toThrow(/^create failed at t1\/s0/);
  });

  it("refuses an audio clip with no sample file", async () => {
    registerSource({ isMidi: 0 });
    registerSlot({ isMidiTrack: 0 });

    await expect(
      duplicate({ type: "clip", id: SOURCE_ID, toPath: "t1/s0" }),
    ).rejects.toThrow("it's an audio clip with no sample file");
  });

  it("keeps a slot for each destination when one can't take the copy", async () => {
    registerSource();
    registerSlot({ trackIndex: 1 });
    registerSlot({ trackIndex: 2, isMidiTrack: 0, newClipId: "other" });

    const result = await duplicate({
      type: "clip",
      id: SOURCE_ID,
      toPath: "t2/s0,t1/s0",
    });

    expect(result).toStrictEqual([
      { path: "t2/s0", ok: false, detail: expect.any(String) },
      expect.objectContaining({ id: NEW_ID, path: "t1/s0" }),
    ]);
  });

  it("creates the scenes a slot past the last one needs", async () => {
    registerSource();
    registerSlot({ trackIndex: 1, sceneIndex: 0 });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("scene_0") },
      methods: {
        create_scene: () => {
          registerSlot({ trackIndex: 1, sceneIndex: 1 });

          return null;
        },
      },
    });

    const result = await duplicate({
      type: "clip",
      id: SOURCE_ID,
      toPath: "t1/s1",
    });

    expect(result).toStrictEqual({
      id: NEW_ID,
      path: "t1/s1",
      created: "s1",
      detail: "re-created from the arrangement clip",
    });
  });

  it("names the scenes it made when a lone copy fails", async () => {
    registerSource();
    registerSlot({ trackIndex: 1, sceneIndex: 0 });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("scene_0") },
      methods: {
        create_scene: () => {
          registerSlot({ trackIndex: 1, sceneIndex: 1, createFails: true });

          return null;
        },
      },
    });

    await expect(
      duplicate({ type: "clip", id: SOURCE_ID, toPath: "t1/s1" }),
    ).rejects.toThrow(
      /^create failed at t1\/s1 .*\. Created s1 to reach it\.$/,
    );
  });

  it("skips a slot that still isn't there", async () => {
    registerSource();
    registerSlot({ trackIndex: 1, sceneIndex: 0 });

    const result = await duplicate({
      type: "clip",
      id: SOURCE_ID,
      toPath: "t1/s0,t1/s9",
    });

    expect(result).toStrictEqual([
      expect.objectContaining({ id: NEW_ID, path: "t1/s0" }),
      {
        path: "t1/s9",
        ok: false,
        detail: "no clip slot there; created s2-s9 to reach it",
      },
    ]);
  });
});

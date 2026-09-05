// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as consoleModule from "#src/shared/max/v8-max-console.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import {
  createTestNote,
  registerDrumRackTrack,
  setupAudioClipMock,
  setupMidiClipMock,
  setupNotesMock,
} from "./read-clip-test-helpers.ts";

// Chord (two pitches at time 0) plus a repeat of one pitch at time 2. Drum mode
// groups by pitch ("C1 1|1,3\nE1 1|1"); melodic groups by time, emitting the
// chord on one line ("C1 E1 1|1\nC1 1|3"). The two outputs differ, so notes
// pin the resolved drumMode value.
const DRUM_CHORD_NOTES = [
  createTestNote({ pitch: 36, startTime: 0, duration: 0.25 }),
  createTestNote({ pitch: 40, startTime: 0, duration: 0.25 }),
  createTestNote({ pitch: 36, startTime: 2, duration: 0.25 }),
];
const DRUM_MODE_OUTPUT = "v100 n/16 C1 1|1,3\nE1 1|1";
const MELODIC_MODE_OUTPUT = "v100 n/16 C1 E1 1|1\nC1 1|3";

// Set up a standalone 4/4 MIDI clip holding DRUM_CHORD_NOTES in slot 0/0, then
// read its notes. `readOverrides` tweaks the readClip args (e.g. drumMode).
function readDrumChordNotes(
  readOverrides: Partial<Parameters<typeof readClip>[0]> = {},
) {
  setupMidiClipMock({
    trackIndex: 0,
    sceneIndex: 0,
    notes: DRUM_CHORD_NOTES,
    clipProps: {
      is_midi_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      length: 4,
    },
  });

  return readClip({
    trackIndex: 0,
    sceneIndex: 0,
    include: ["notes"],
    ...readOverrides,
  }).notes;
}

describe("readClip - include flag gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("suppresses the empty-slot warning when suppressEmptyWarning is set", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    // Track and scene exist, clip slot is empty (clip id "0" => !exists()).
    registerMockObject("track4", { path: livePath.track(4), type: "Track" });
    registerMockObject("scene5", { path: livePath.scene(5), type: "Scene" });
    registerMockObject("0", {
      path: livePath.track(4).clipSlot(5).clip(),
      type: "Clip",
    });

    const result = readClip({
      trackIndex: 4,
      sceneIndex: 5,
      suppressEmptyWarning: true,
    });

    expect(result).toStrictEqual({
      id: null,
      type: null,
      name: null,
      path: "t4/s5",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("includes color only when color is requested", () => {
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 1,
        color: 16711680, // 0xFF0000
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    const withColor = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["color"],
    });

    expect(withColor.color).toBe("#FF0000");
  });

  it("omits color when color is not requested", () => {
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 1,
        color: 16711680,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.color).toBeUndefined();
  });

  it("does not process notes for an audio clip even when notes are requested", () => {
    // Audio clip whose get_notes_extended returns real notes. The MIDI-only
    // note processing must be skipped because the clip is audio.
    const clip = setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    setupNotesMock(clip, [createTestNote({ pitch: 60, startTime: 0 })]);

    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["notes"],
    });

    expect(result.type).toBe("audio");
    expect(result.notes).toBeUndefined();
  });

  it("does not read audio properties for a MIDI clip", () => {
    // MIDI clip with audio-only backing props registered. The audio-processing
    // branch is gated on type==="audio", so none of them must surface.
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        gain: 0.9,
        file_path: "/Users/x/kick.wav",
        pitch_coarse: 3,
        pitch_fine: 0,
      },
    });

    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["sample"],
    });

    expect(result.type).toBe("midi");
    expect(result.sampleFile).toBeUndefined();
    expect(result.gainDb).toBeUndefined();
    expect(result.pitchShift).toBeUndefined();
  });

  it("omits firstStart when the start-marker offset is exactly the epsilon", () => {
    // SAME_TIME_EPSILON is 0.001. With the difference AT the epsilon, `> epsilon`
    // must be false (no firstStart); `>= epsilon` would wrongly include it.
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        looping: 1,
        loop_start: 0,
        loop_end: 4,
        start_marker: 0.001, // |0.001 - 0| === SAME_TIME_EPSILON
        end_marker: 4,
      },
    });

    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["timing"],
    });

    expect(result.start).toBe("1|1");
    expect(result.firstStart).toBeUndefined();
  });

  it("does not process notes when notes are not requested", () => {
    // Clip has real notes, but include omits "notes": the early-return guard
    // must prevent any note formatting.
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      notes: [createTestNote({ pitch: 60, startTime: 0 })],
      clipProps: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.notes).toBeUndefined();
  });

  it("does not read base sample properties when only warp is requested", () => {
    // includeSample is false; the base-audio branch must be skipped even though
    // gain/file_path/pitch are present.
    setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        gain: 0.9,
        file_path: "/Users/x/kick.wav",
        pitch_coarse: 3,
        pitch_fine: 0,
        warp_mode: 0,
        warping: 1,
      },
    });

    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp"],
    });

    expect(result.sampleFile).toBeUndefined();
    expect(result.gainDb).toBeUndefined();
    expect(result.pitchShift).toBeUndefined();
    // Warp props ARE present (proves processAudioClip ran).
    expect(result.warping).toBe(true);
  });

  it("omits gainDb when the gain maps to exactly 0 dB (unity)", () => {
    // gain 0.4 => 0.00 dB. `gainDb !== 0` must be false so the field is omitted.
    setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        gain: 0.4,
      },
    });

    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["sample"],
    });

    expect(result.gainDb).toBeUndefined();
  });

  it("omits arrangementLength for an arrangement clip when timing is not requested", () => {
    setupMidiClipMock({
      clipId: "arr_clip",
      path: livePath.track(2).arrangementClip(0),
      clipProps: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        start_time: 8,
        end_time: 12,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });
    registerMockObject("live-set", {
      path: "live_set",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = readClip({ id: "id arr_clip", include: [] });

    expect(result.view).toBe("arrangement");
    expect(result.path).toBe("t2[3|1]"); // start_time 8 in 4/4
    expect(result.arrangementLength).toBeUndefined();
  });
});

describe("readClip - drum mode resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("uses drum notation for a standalone read of a Drum Rack track", () => {
    registerDrumRackTrack();

    expect(readDrumChordNotes()).toBe(DRUM_MODE_OUTPUT);
  });

  it("uses melodic notation for a standalone read of a non-drum track", () => {
    expect(readDrumChordNotes()).toBe(MELODIC_MODE_OUTPUT);
  });

  it("honors an explicit precomputed drumMode over the track scan", () => {
    // drumMode:true is passed even though the track is NOT a drum rack. The
    // precomputed value must win (nullish-coalesce), yielding drum notation.
    expect(readDrumChordNotes({ drumMode: true })).toBe(DRUM_MODE_OUTPUT);
  });
});

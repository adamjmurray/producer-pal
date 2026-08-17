// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clips of the example Live Set: a drum loop and a bass line in the
// Session, the same bass line in the Arrangement with a second take on a take
// lane, and one warped vocal sample. See live-set.ts.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { ID } from "./ids.ts";
import { clipSlotMethods } from "./writes.ts";

/** Clip colors, as the packed RGB integer the Live API reports */
const COLOR = {
  drums: 0xff4c4c,
  bass: 0xb87a35,
  vocals: 0x3dc300,
} as const;

interface LiveNote {
  note_id: number;
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability: number;
  velocity_deviation: number;
}

/** A four-on-the-floor kick with offbeat hats, on the General MIDI drum map */
const DRUM_NOTES: LiveNote[] = [
  note(1, 36, 0, 0.25, 110),
  note(2, 42, 0.5, 0.25, 70),
  note(3, 36, 1, 0.25, 100),
  note(4, 42, 1.5, 0.25, 70),
  note(5, 38, 2, 0.25, 105),
  note(6, 42, 2.5, 0.25, 70),
  note(7, 36, 3, 0.25, 100),
  note(8, 42, 3.5, 0.25, 70),
];

/** Two bars of root-fifth bass in F minor */
const BASS_NOTES: LiveNote[] = [
  note(11, 41, 0, 1.5, 100),
  note(12, 41, 2, 0.5, 90),
  note(13, 48, 3, 1, 85),
  note(14, 39, 4, 2, 100),
];

/**
 * Register every clip in the example Live Set, and the clip slots holding them.
 * @returns Nothing; the clips land in the mock registry
 */
export function registerExampleClips(): void {
  registerSessionSlots();
  registerDrumSessionClip();
  registerBassSessionClip();
  registerVocalSessionClip();
  registerBassArrangementClips();
}

// The Intro scene holds only drums; the Verse scene holds all three. Live
// reports an empty slot too, so the fixture carries both states.
function registerSessionSlots(): void {
  const slots: [string, number, number, string | null][] = [
    ["drum_slot_0", 0, 0, ID.drumSessionClip],
    ["drum_slot_1", 0, 1, null],
    ["bass_slot_0", 1, 0, null],
    ["bass_slot_1", 1, 1, ID.bassSessionClip],
    ["vocal_slot_0", 2, 0, null],
    ["vocal_slot_1", 2, 1, ID.vocalSessionClip],
  ];

  for (const [slotId, trackIndex, sceneIndex, clipId] of slots) {
    registerMockObject(slotId, {
      path: livePath.track(trackIndex).clipSlot(sceneIndex),
      type: "ClipSlot",
      properties: {
        has_clip: clipId == null ? 0 : 1,
        clip: clipId == null ? children() : children(clipId),
        is_triggered: 0,
      },
      methods: clipSlotMethods(trackIndex, sceneIndex),
    });
  }
}

function registerDrumSessionClip(): void {
  registerMockObject(ID.drumSessionClip, {
    path: livePath.track(0).clipSlot(0).clip(),
    type: "Clip",
    properties: {
      ...midiClipDefaults(),
      name: "Kick + Hats",
      color: COLOR.drums,
      is_playing: 1,
      length: 4,
      end_marker: 4,
      loop_end: 4,
    },
    methods: { get_notes_extended: () => notesJson(DRUM_NOTES) },
  });
}

function registerBassSessionClip(): void {
  registerMockObject(ID.bassSessionClip, {
    path: livePath.track(1).clipSlot(1).clip(),
    type: "Clip",
    properties: {
      ...midiClipDefaults(),
      name: "Bass Line",
      color: COLOR.bass,
      length: 8,
      end_marker: 8,
      loop_end: 8,
    },
    methods: { get_notes_extended: () => notesJson(BASS_NOTES) },
  });
}

function registerVocalSessionClip(): void {
  registerMockObject(ID.vocalSessionClip, {
    path: livePath.track(2).clipSlot(1).clip(),
    type: "Clip",
    properties: {
      ...clipDefaults(),
      is_midi_clip: 0,
      is_audio_clip: 1,
      name: "Vocal Take",
      color: COLOR.vocals,
      muted: 1,
      length: 8,
      start_marker: 0,
      end_marker: 8,
      loop_start: 0,
      loop_end: 8,
      looping: 1,
      gain: 0.35,
      pitch_coarse: 0,
      pitch_fine: 0,
      file_path: "/Users/example/Music/Samples/Vocal Take.wav",
      sample_length: 352800,
      sample_rate: 44100,
      warping: 1,
      warp_mode: 4,
      warp_markers: JSON.stringify([
        { beat_time: 0, sample_time: 0 },
        { beat_time: 8, sample_time: 4 },
      ]),
    },
  });
}

// The bass line is in the Arrangement at bar 9, with an alternate take under it
// on the first take lane and an empty second lane.
function registerBassArrangementClips(): void {
  registerBassArrangementClip(
    ID.bassArrangementClip,
    livePath.track(1).arrangementClip(0),
    "Bass Line",
  );

  registerMockObject("bass_take_lane_0", {
    path: livePath.track(1).takeLane(0),
    type: "TakeLane",
    properties: {
      name: "Take Lane 1",
      arrangement_clips: children(ID.bassTakeLaneClip),
    },
  });

  registerBassArrangementClip(
    ID.bassTakeLaneClip,
    livePath.track(1).takeLane(0).arrangementClip(0),
    "Bass Line (alt)",
  );

  registerMockObject("bass_take_lane_1", {
    path: livePath.track(1).takeLane(1),
    type: "TakeLane",
    properties: { name: "Take Lane 2", arrangement_clips: children() },
  });
}

function registerBassArrangementClip(
  clipId: string,
  clipPath: string,
  name: string,
): void {
  registerMockObject(clipId, {
    path: clipPath,
    type: "Clip",
    properties: {
      ...midiClipDefaults(),
      name,
      color: COLOR.bass,
      is_arrangement_clip: 1,
      length: 8,
      end_marker: 8,
      loop_end: 8,
      start_time: 32,
      end_time: 40,
    },
    methods: { get_notes_extended: () => notesJson(BASS_NOTES) },
  });
}

function clipDefaults(): Record<string, unknown> {
  return {
    is_arrangement_clip: 0,
    is_playing: 0,
    is_triggered: 0,
    is_recording: 0,
    is_overdubbing: 0,
    muted: 0,
    looping: 1,
    start_marker: 0,
    loop_start: 0,
    signature_numerator: 4,
    signature_denominator: 4,
  };
}

function midiClipDefaults(): Record<string, unknown> {
  return { ...clipDefaults(), is_midi_clip: 1, is_audio_clip: 0 };
}

function note(
  noteId: number,
  pitch: number,
  startTime: number,
  duration: number,
  velocity: number,
): LiveNote {
  return {
    note_id: noteId,
    pitch,
    start_time: startTime,
    duration,
    velocity,
    probability: 1,
    velocity_deviation: 0,
  };
}

function notesJson(notes: LiveNote[]): string {
  return JSON.stringify({ notes });
}

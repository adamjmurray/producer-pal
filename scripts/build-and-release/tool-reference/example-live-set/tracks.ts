// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The tracks of the example Live Set, plus the mixer objects hanging off each.
// See live-set.ts for the whole picture.

import {
  livePath,
  type TrackPath,
} from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  createOutputOnlyRoutingMock,
  createSimpleRoutingMock,
} from "#src/test/mocks/routing-test-helpers.ts";
import { ID } from "./ids.ts";
import { trackMethods } from "./writes.ts";

/** Track colors, as the packed RGB integer the Live API reports */
const COLOR = {
  drums: 0xff4c4c,
  bass: 0xb87a35,
  vocals: 0x3dc300,
  neutral: 0x7f7f7f,
} as const;

interface MixerOptions {
  /** Volume as Live's display string, e.g. "-6.0 dB" */
  gain: string;
  /** Pan from -1 (left) to 1 (right) */
  pan: number;
  /** Send levels as display strings, one per return track */
  sends?: string[];
}

/**
 * Register every track in the example Live Set: three regular tracks, one
 * return track, and the master track.
 * @returns Nothing; the tracks land in the mock registry
 */
export function registerExampleTracks(): void {
  registerDrumTrack();
  registerBassTrack();
  registerVocalTrack();
  registerReturnTrack();
  registerMasterTrack();
}

function registerDrumTrack(): void {
  registerMockObject(ID.drumTrack, {
    path: livePath.track(0),
    type: "Track",
    properties: {
      ...createSimpleRoutingMock(),
      has_midi_input: 1,
      name: "Drums",
      color: COLOR.drums,
      mute: 0,
      solo: 0,
      arm: 1,
      can_be_armed: 1,
      is_foldable: 0,
      is_grouped: 0,
      group_track: ["id", 0],
      playing_slot_index: 0,
      fired_slot_index: -1,
      clip_slots: children("drum_slot_0", "drum_slot_1"),
      arrangement_clips: children(),
      take_lanes: children(),
      devices: children(ID.drumRack),
      mixer_device: children("drum_mixer"),
    },
    methods: trackMethods(0),
  });
  registerMixer("drum_mixer", livePath.track(0), {
    gain: "0.0 dB",
    pan: 0,
    sends: ["-inf dB"],
  });
}

function registerBassTrack(): void {
  registerMockObject(ID.bassTrack, {
    path: livePath.track(1),
    type: "Track",
    properties: {
      ...createSimpleRoutingMock(),
      has_midi_input: 1,
      name: "Bass",
      color: COLOR.bass,
      mute: 0,
      solo: 0,
      arm: 0,
      can_be_armed: 1,
      is_foldable: 0,
      is_grouped: 0,
      group_track: ["id", 0],
      playing_slot_index: -1,
      fired_slot_index: -1,
      clip_slots: children("bass_slot_0", "bass_slot_1"),
      arrangement_clips: children(ID.bassArrangementClip),
      take_lanes: children("bass_take_lane_0", "bass_take_lane_1"),
      devices: children(ID.bassInstrument, ID.bassReverb),
      mixer_device: children("bass_mixer"),
    },
    methods: trackMethods(1),
  });
  registerMixer("bass_mixer", livePath.track(1), {
    gain: "-3.0 dB",
    pan: -0.25,
    sends: ["-12.0 dB"],
  });
}

function registerVocalTrack(): void {
  registerMockObject(ID.vocalTrack, {
    path: livePath.track(2),
    type: "Track",
    properties: {
      ...createSimpleRoutingMock(),
      has_midi_input: 0,
      name: "Vocals",
      color: COLOR.vocals,
      mute: 1,
      solo: 0,
      arm: 0,
      can_be_armed: 1,
      is_foldable: 0,
      is_grouped: 0,
      group_track: ["id", 0],
      playing_slot_index: -1,
      fired_slot_index: -1,
      clip_slots: children("vocal_slot_0", "vocal_slot_1"),
      arrangement_clips: children(),
      take_lanes: children(),
      devices: children(),
      mixer_device: children("vocal_mixer"),
    },
    methods: trackMethods(2),
  });
  registerMixer("vocal_mixer", livePath.track(2), {
    gain: "-6.0 dB",
    pan: 0.5,
    sends: ["-6.0 dB"],
  });
}

function registerReturnTrack(): void {
  registerAuxTrack(ID.returnTrack, livePath.returnTrack(0), "A Reverb");
}

function registerMasterTrack(): void {
  registerAuxTrack(ID.masterTrack, livePath.masterTrack(), "Master");
}

/**
 * Register a return or master track: no clips, no devices, output routing only.
 * @param id - Object id for the track
 * @param trackPath - Its Live API path
 * @param name - Track name
 */
function registerAuxTrack(
  id: string,
  trackPath: TrackPath,
  name: string,
): void {
  const mixerId = `${id}_mixer`;

  registerMockObject(id, {
    path: trackPath,
    type: "Track",
    properties: {
      ...createOutputOnlyRoutingMock(),
      has_midi_input: 0,
      name,
      color: COLOR.neutral,
      mute: 0,
      solo: 0,
      arm: 0,
      can_be_armed: 0,
      is_foldable: 0,
      is_grouped: 0,
      group_track: ["id", 0],
      clip_slots: children(),
      arrangement_clips: children(),
      devices: children(),
      mixer_device: children(mixerId),
    },
  });
  registerMixer(mixerId, trackPath, { gain: "0.0 dB", pan: 0 });
}

/**
 * Register a track's mixer device and the parameters the mixer read walks.
 * @param mixerId - Object id for the mixer device
 * @param trackPath - Path of the track that owns it
 * @param options - Gain, pan, and send levels to report
 */
function registerMixer(
  mixerId: string,
  trackPath: TrackPath,
  options: MixerOptions,
): void {
  const sendIds = (options.sends ?? []).map((_, i) => `${mixerId}_send_${i}`);

  registerMockObject(mixerId, {
    path: `${String(trackPath)} mixer_device`,
    type: "MixerDevice",
    properties: {
      panning_mode: 0,
      volume: children(`${mixerId}_volume`),
      panning: children(`${mixerId}_panning`),
      sends: children(...sendIds),
    },
  });

  registerMockObject(`${mixerId}_volume`, {
    path: `${String(trackPath)} mixer_device volume`,
    type: "DeviceParameter",
    properties: { display_value: options.gain },
  });

  registerMockObject(`${mixerId}_panning`, {
    path: `${String(trackPath)} mixer_device panning`,
    type: "DeviceParameter",
    properties: { value: options.pan },
  });

  for (const [i, gain] of (options.sends ?? []).entries()) {
    registerMockObject(sendIds[i] as string, {
      path: `${String(trackPath)} mixer_device sends ${i}`,
      type: "DeviceParameter",
      properties: { display_value: gain },
    });
  }
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** Return tracks in the world: A with an empty envelope clip, B with one. */
export const RETURNS = 2;
export const SCENES = 3;

/** The Live version a Live 13 beta reports. */
export const LIVE_13 = "13.0";

/** Mocks the tests look at. */
export interface EnvelopeWorld {
  noEnvs: RegisteredMockObject;
  withEnv: RegisteredMockObject;
  returnTracks: RegisteredMockObject[];
  /** The clip slots of the return tracks, by return then scene */
  slots: RegisteredMockObject[][];
}

/**
 * A Live Set with one MIDI track and return tracks, each with a slot per scene
 * on Live 13 (none on Live 12). Return track 0 has an envelope clip "No Envs"
 * in scene 0, and return track 1 has "With Env" there, which holds automation.
 * The clips are registered on Live 12 too, so a read that wrongly goes there
 * finds them instead of failing for want of a mock.
 * @param liveVersion - The version Live reports
 * @returns The mocks the tests look at
 */
export function registerEnvelopeWorld(liveVersion = LIVE_13): EnvelopeWorld {
  mockNonExistentObjects();
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => liveVersion },
  });
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      tracks: children("track0"),
      return_tracks: children("return0", "return1"),
      scenes: children("scene0", "scene1", "scene2"),
    },
  });

  for (let scene = 0; scene < SCENES; scene++) {
    registerMockObject(`scene${scene}`, {
      path: livePath.scene(scene),
      type: "Scene",
      properties: { name: `Scene ${scene + 1}` },
    });
  }

  registerMockObject("track0", {
    path: livePath.track(0),
    type: "Track",
    properties: {
      name: "Synth",
      has_midi_input: 1,
      clip_slots: children("t0s0", "t0s1", "t0s2"),
      arrangement_clips: children(),
      devices: children(),
    },
  });

  registerMockObject("master", {
    path: livePath.masterTrack(),
    type: "Track",
    properties: { name: "Main", has_midi_input: 0, devices: children() },
  });

  const isLive13 = liveVersion.startsWith("13");
  const names = ["A-Echo", "B-Wide Hallway"];
  const returnTracks = names.map((name, index) =>
    registerMockObject(`return${index}`, {
      path: livePath.returnTrack(index),
      type: "Track",
      properties: {
        name,
        has_midi_input: 0,
        devices: children(),
        ...(isLive13 && {
          clip_slots: children(
            ...Array.from({ length: SCENES }, (_, s) => `r${index}s${s}`),
          ),
        }),
      },
    }),
  );

  const slots = isLive13 ? registerReturnSlots() : [];

  return {
    noEnvs: registerEnvelopeClip("no-envs", 0, "No Envs", 0),
    withEnv: registerEnvelopeClip("with-env", 1, "With Env", 1),
    returnTracks,
    slots,
  };
}

/**
 * One envelope clip, 1 bar long, in scene 0 of a return track.
 * @param id - The clip's id
 * @param returnIndex - The return track it sits on
 * @param name - The clip's name
 * @param hasEnvelopes - The `has_envelopes` flag
 * @returns The clip's mock
 */
export function registerEnvelopeClip(
  id: string,
  returnIndex: number,
  name: string,
  hasEnvelopes: number,
): RegisteredMockObject {
  return registerMockObject(id, {
    path: livePath.returnTrack(returnIndex).clipSlot(0).clip(),
    type: "Clip",
    properties: envelopeClipProperties(name, hasEnvelopes),
  });
}

/**
 * What Live reads from an envelope clip: 1 bar long, neither MIDI nor audio.
 * @param name - The clip's name
 * @param hasEnvelopes - The `has_envelopes` flag
 * @returns The clip's properties
 */
export function envelopeClipProperties(
  name: string,
  hasEnvelopes: number,
): Record<string, unknown> {
  return {
    name,
    color: 16711680,
    is_midi_clip: 0,
    is_audio_clip: 0,
    is_arrangement_clip: 0,
    has_envelopes: hasEnvelopes,
    length: 4,
    looping: 0,
    loop_start: 0,
    loop_end: 4,
    start_marker: 0,
    end_marker: 4,
    signature_numerator: 4,
    signature_denominator: 4,
    is_playing: 0,
    muted: 0,
  };
}

/**
 * The clip slots of every return track, with a clip in scene 0 of each.
 * @returns The slot mocks, by return then scene
 */
function registerReturnSlots(): RegisteredMockObject[][] {
  return Array.from({ length: RETURNS }, (_, returnIndex) =>
    Array.from({ length: SCENES }, (__, scene) =>
      registerMockObject(`r${returnIndex}s${scene}`, {
        path: livePath.returnTrack(returnIndex).clipSlot(scene),
        properties: { has_clip: scene === 0 ? 1 : 0 },
      }),
    ),
  );
}

/**
 * The calls made on every return track's clip slots, for a test of Live 12.
 * @param world - The mocks
 * @returns The reads that reached a return track's `clip_slots`
 */
export function clipSlotReadsOnReturns(world: EnvelopeWorld): unknown[] {
  return world.returnTracks.flatMap((track) =>
    track.get.mock.calls.filter(([prop]) => prop === "clip_slots"),
  );
}

/**
 * A plain MIDI clip in scene 0 of the MIDI track, for calls that name it beside
 * an envelope clip.
 * @returns The clip's mock
 */
export function registerRegularClip(): RegisteredMockObject {
  return registerMockObject("regular", {
    path: livePath.track(0).clipSlot(0).clip(),
    type: "Clip",
    properties: {
      name: "Regular",
      is_midi_clip: 1,
      is_audio_clip: 0,
      is_arrangement_clip: 0,
      length: 4,
      looping: 0,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });
}

/**
 * Every call or write that changed an envelope clip, a slot or a return track.
 * @param world - The mocks
 * @returns The sets and the calls, which must be empty after a refusal
 */
export function writesToReturns(world: EnvelopeWorld): string[] {
  return [
    world.noEnvs,
    world.withEnv,
    ...world.returnTracks,
    ...world.slots.flat(),
  ].flatMap((mock) => [
    ...mock.set.mock.calls.map(([prop]) => `set ${String(prop)}`),
    ...mock.call.mock.calls.map(([method]) => `call ${String(method)}`),
  ]);
}

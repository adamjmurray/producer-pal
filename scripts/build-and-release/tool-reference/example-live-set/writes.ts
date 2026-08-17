// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The Live API methods the create and duplicate tools call. Each one registers
// the object Live would have made and patches its container to match, so the
// tool can read the result back — which is the whole content of a create
// tool's result. Every example runs against a freshly built Live Set, so these
// mutations never leak from one example to the next.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import { ID } from "./ids.ts";

type Methods = Record<string, (...args: unknown[]) => unknown>;

/**
 * Methods on the Live Set: creating and duplicating tracks and scenes.
 * @returns Method implementations for the live_set mock
 */
export function liveSetMethods(): Methods {
  return {
    create_midi_track: (index: unknown) => createdTrack(Number(index), true),
    create_audio_track: (index: unknown) => createdTrack(Number(index), false),
    create_return_track: () => createdReturnTrack(),
    create_scene: (index: unknown) => createdScene(Number(index)),
    duplicate_track: (index: unknown) => createdTrack(Number(index) + 1, true),
    duplicate_scene: (index: unknown) => createdScene(Number(index) + 1),
    delete_track: () => null,
    delete_return_track: () => null,
    delete_scene: () => null,
  };
}

/**
 * Methods on a session clip slot: creating and duplicating the clip in it.
 * @param trackIndex - Track the slot belongs to
 * @param sceneIndex - Scene the slot belongs to
 * @returns Method implementations for that clip slot's mock
 */
export function clipSlotMethods(
  trackIndex: number,
  sceneIndex: number,
): Methods {
  const slotPath = String(livePath.track(trackIndex).clipSlot(sceneIndex));

  return {
    create_clip: (length: unknown) => fillSlot(slotPath, Number(length)),
    create_audio_clip: () => fillSlot(slotPath, 4),
    // Called on the source slot, with the destination slot's id.
    duplicate_clip_to: (destSlotId: unknown) => {
      const dest = lookupMockObject(String(destSlotId).replace(/^id /, ""));

      return dest ? fillSlot(dest.path, 4) : null;
    },
    delete_clip: () => null,
    fire: () => null,
  };
}

/**
 * Methods on a track: arrangement clips, take lanes, and device removal.
 * @param trackIndex - Track the methods belong to
 * @returns Method implementations for that track's mock
 */
export function trackMethods(trackIndex: number): Methods {
  return {
    create_midi_clip: (start: unknown, length: unknown) =>
      createdArrangementClip(trackIndex, Number(start), Number(length)),
    duplicate_clip_to_arrangement: (_clipId: unknown, start: unknown) =>
      createdArrangementClip(trackIndex, Number(start), 8),
    create_take_lane: () => null,
    delete_clip: () => null,
    delete_device: () => null,
    insert_device: (deviceName: unknown, position: unknown) =>
      createdDevice(String(livePath.track(trackIndex)), deviceName, position),
  };
}

function createdTrack(trackIndex: number, isMidi: boolean): string[] {
  registerMockObject(ID.newTrack, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: {
      has_midi_input: isMidi ? 1 : 0,
      name: isMidi ? "MIDI" : "Audio",
      clip_slots: children(),
      arrangement_clips: children(),
      devices: children(),
    },
  });
  appendChild(livePath.liveSet, "tracks", ID.newTrack);

  return ["id", ID.newTrack];
}

function createdReturnTrack(): string[] {
  registerMockObject(ID.newTrack, {
    path: livePath.returnTrack(1),
    type: "Track",
    properties: {
      has_midi_input: 0,
      name: "B Return",
      clip_slots: children(),
      arrangement_clips: children(),
      devices: children(),
    },
  });
  appendChild(livePath.liveSet, "return_tracks", ID.newTrack);

  return ["id", ID.newTrack];
}

function createdScene(sceneIndex: number): string[] {
  registerMockObject(ID.newScene, {
    path: livePath.scene(sceneIndex),
    type: "Scene",
    properties: {
      name: "",
      is_empty: 1,
      is_triggered: 0,
      tempo: -1,
      tempo_enabled: 0,
      time_signature_numerator: -1,
      time_signature_denominator: -1,
      time_signature_enabled: 0,
      clip_slots: children(),
    },
  });
  appendChild(livePath.liveSet, "scenes", ID.newScene);

  return ["id", ID.newScene];
}

// Put a new clip in a session slot, and make the slot report it.
function fillSlot(slotPath: string, lengthBeats: number): null {
  registerNewClip(`${slotPath} clip`, newClipProperties(lengthBeats));

  const slot = lookupMockObject(undefined, slotPath);

  if (slot) {
    slot.properties.has_clip = 1;
    slot.properties.clip = children(ID.newClip);
  }

  return null;
}

function createdArrangementClip(
  trackIndex: number,
  startBeats: number,
  lengthBeats: number,
): string {
  registerNewClip(livePath.track(trackIndex).arrangementClip(0), {
    ...newClipProperties(lengthBeats),
    is_arrangement_clip: 1,
    start_time: startBeats,
    end_time: startBeats + lengthBeats,
  });
  appendChild(livePath.track(trackIndex), "arrangement_clips", ID.newClip);

  return `id ${ID.newClip}`;
}

function createdDevice(
  containerPath: string,
  deviceName: unknown,
  position: unknown,
): string[] {
  // Live appends when no position is given.
  const container = lookupMockObject(undefined, containerPath);
  const deviceCount =
    ((container?.properties.devices as string[] | undefined)?.length ?? 0) / 2;
  const index = position == null ? deviceCount : Number(position);

  registerMockObject(ID.newDevice, {
    path: `${containerPath} devices ${index}`,
    type: "Device",
    properties: {
      name: String(deviceName),
      class_name: String(deviceName).replaceAll(" ", ""),
      class_display_name: String(deviceName),
      type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
      is_active: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      parameters: children(),
    },
  });
  appendChild(containerPath, "devices", ID.newDevice);

  return ["id", ID.newDevice];
}

// A new clip has to remember what was written to it: create-clip reports the
// note count by reading the clip back, not by counting what it sent.
function registerNewClip(
  clipPath: string,
  properties: Record<string, unknown>,
): void {
  let notes: unknown[] = [];

  registerMockObject(ID.newClip, {
    path: clipPath,
    type: "Clip",
    properties,
    methods: {
      add_new_notes: (arg: unknown) => {
        notes = notes.concat((arg as { notes: unknown[] }).notes);

        return null;
      },
      get_notes_extended: () => JSON.stringify({ notes }),
      remove_notes_extended: () => {
        notes = [];

        return null;
      },
    },
  });
}

function newClipProperties(lengthBeats: number): Record<string, unknown> {
  return {
    is_midi_clip: 1,
    is_audio_clip: 0,
    is_arrangement_clip: 0,
    is_playing: 0,
    is_triggered: 0,
    is_recording: 0,
    is_overdubbing: 0,
    muted: 0,
    looping: 1,
    name: "",
    color: 0xb87a35,
    length: lengthBeats,
    start_marker: 0,
    end_marker: lengthBeats,
    loop_start: 0,
    loop_end: lengthBeats,
    signature_numerator: 4,
    signature_denominator: 4,
  };
}

// Live's child lists are flat ["id", 1, "id", 2, …] arrays.
function appendChild(
  parentPath: { toString: () => string },
  property: string,
  childId: string,
): void {
  const parent = lookupMockObject(undefined, parentPath);

  if (!parent) return;

  const current = (parent.properties[property] as string[] | undefined) ?? [];

  parent.properties[property] = [...current, ...children(childId)];
}

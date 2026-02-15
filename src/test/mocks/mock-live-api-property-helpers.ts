// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LiveObjectType } from "#src/types/live-object-types.ts";

export class MockSequence extends Array<unknown> {}

// Exact path → type mappings
const EXACT_PATH_TYPES = new Map<string, LiveObjectType>([
  ["live_set", "Song"],
  ["live_set view", "Song.View"],
  ["live_app", "Application"],
  ["live_app view", "Application.View"],
  ["live_set master_track", "Track"],
  ["live_set view selected_track", "Track"],
  ["live_set view selected_scene", "Scene"],
  ["live_set view detail_clip", "Clip"],
  ["live_set view highlighted_clip_slot", "ClipSlot"],
]);

// Regex patterns matched against the full path or path suffix.
// Order matters: more specific patterns (clip_slots \d+ clip) before less specific (clip_slots \d+).
const PATH_PATTERNS: [RegExp, LiveObjectType][] = [
  [/^live_set (?:return_)?tracks \d+$/, "Track"],
  [/^live_set scenes \d+$/, "Scene"],
  [/^live_set cue_points \d+$/, "CuePoint"],
  [/clip_slots \d+ clip$/, "Clip"],
  [/clip_slots \d+$/, "ClipSlot"],
  [/arrangement_clips \d+$/, "Clip"],
  [/devices \d+$/, "Device"],
  [/drum_pads \d+$/, "DrumPad"],
  [/parameters \d+$/, "DeviceParameter"],
  [/mixer_device$/, "MixerDevice"],
  [
    /mixer_device (?:volume|panning|left_split_stereo|right_split_stereo|crossfader|song_tempo)$/,
    "DeviceParameter",
  ],
];

/**
 * Detect Live API type from path using standard Live API path patterns.
 * @param path - Live API object path
 * @param id - Optional bare ID for chain detection
 * @returns Detected Live API object type
 */
export function detectTypeFromPath(path: string, id?: string): LiveObjectType {
  const exactMatch = EXACT_PATH_TYPES.get(path);

  if (exactMatch) return exactMatch;

  for (const [pattern, type] of PATH_PATTERNS) {
    if (pattern.test(path)) return type;
  }

  // Chain detection (broad match - after more specific terminal patterns)
  if (path.includes("chain") || id?.includes("chain")) return "Chain";

  return "Device";
}

/**
 * Create Live API children array format from child IDs
 * @param childIds - Child object IDs to format as Live API array
 * @returns Formatted Live API children array
 */
export function children(...childIds: string[]): string[] {
  return childIds.flatMap((id) => ["id", id]);
}

/**
 * Get mock property value for Song (live_set) objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
export function getLiveSetProperty(prop: string): unknown[] | null {
  switch (prop) {
    case "tracks":
      return children("track1", "track2");
    case "scenes":
      return children("scene1", "scene2");
    case "signature_numerator":
      return [4];
    case "signature_denominator":
      return [4];
    default:
      return null;
  }
}

/**
 * Get mock property value for Application.View objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
export function getAppViewProperty(prop: string): unknown[] | null {
  switch (prop) {
    case "focused_document_view":
      return ["Session"];
    default:
      return null;
  }
}

/**
 * Get mock property value for Track objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
export function getTrackProperty(prop: string): unknown[] | null {
  switch (prop) {
    case "has_midi_input":
      return [1];
    case "clip_slots":
    case "devices":
      return [];
    case "mixer_device":
      return children("mixer_1");
    case "name":
      return ["Test Track"];
    case "color":
      return [16711680];
    case "mute":
    case "solo":
    case "muted_via_solo":
      return [0];
    case "arm":
      return [1];
    case "can_be_armed":
      return [1];
    case "is_foldable":
    case "is_grouped":
      return [0];
    case "group_track":
      return ["id", 0];
    case "playing_slot_index":
      return [2];
    case "fired_slot_index":
      return [3];
    default:
      return null;
  }
}

/**
 * Get mock property value for Scene objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
export function getSceneProperty(prop: string): unknown[] | null {
  switch (prop) {
    case "name":
      return ["Test Scene"];
    case "clips":
      return [];
    default:
      return null;
  }
}

/**
 * Get mock property value for ClipSlot objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
export function getClipSlotProperty(prop: string): unknown[] | null {
  switch (prop) {
    case "has_clip":
      return [1];
    default:
      return null;
  }
}

/**
 * Get mock property value for Clip objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
export function getClipProperty(prop: string): unknown[] | null {
  switch (prop) {
    case "name":
      return ["Test Clip"];
    case "is_audio_clip":
      return [0];
    case "is_midi_clip":
      return [1];
    case "color":
      return [4047616];
    case "length":
      return [4];
    case "looping":
      return [0];
    case "start_marker":
      return [1];
    case "end_marker":
      return [5];
    case "loop_start":
      return [1];
    case "loop_end":
      return [5];
    case "signature_numerator":
      return [4];
    case "signature_denominator":
      return [4];
    case "is_playing":
    case "is_triggered":
    case "is_recording":
    case "is_overdubbing":
    case "muted":
      return [0];
    default:
      return null;
  }
}

/**
 * Get mock property value for MixerDevice objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
function getMixerDeviceProperty(prop: string): unknown[] | null {
  if (prop === "volume") return children("volume_param_1");
  if (prop === "panning") return children("panning_param_1");
  if (prop === "panning_mode") return [0]; // Default to stereo mode
  if (prop === "left_split_stereo") return children("left_split_param_1");
  if (prop === "right_split_stereo") return children("right_split_param_1");

  return null;
}

/**
 * Get mock property value for DeviceParameter objects
 * @param prop - Property name to retrieve
 * @returns Mock property value
 */
function getDeviceParameterProperty(prop: string): unknown[] | null {
  if (prop === "display_value") return [0]; // Default 0 dB for volume
  if (prop === "value") return [0]; // Default center pan

  return null;
}

/**
 * Get mock property value based on Live API object type
 * @param type - Live API object type (Song, Track, Scene, etc.)
 * @param prop - Property name to retrieve
 * @param _path - Object path (currently unused but kept for API consistency)
 * @returns Mock property value
 */
export function getPropertyByType(
  type: LiveObjectType,
  prop: string,
  _path: string,
): unknown[] | null {
  switch (type) {
    case "Song":
      return getLiveSetProperty(prop);
    case "Application.View":
      return getAppViewProperty(prop);
    case "Track":
      return getTrackProperty(prop);
    case "Scene":
      return getSceneProperty(prop);
    case "ClipSlot":
      return getClipSlotProperty(prop);
    case "Clip":
      return getClipProperty(prop);
    case "MixerDevice":
      return getMixerDeviceProperty(prop);
    case "DeviceParameter":
      return getDeviceParameterProperty(prop);
    default:
      return null;
  }
}

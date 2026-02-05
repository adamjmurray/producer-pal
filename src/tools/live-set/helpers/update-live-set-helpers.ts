// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  VALID_PITCH_CLASS_NAMES,
  pitchClassToNumber,
} from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import { createAudioClipInSession } from "#src/tools/shared/arrangement/arrangement-tiling.ts";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

interface TempClipInfo {
  track: LiveAPI;
  clipId: string;
  isMidiTrack: boolean;
  slot?: LiveAPI;
}

/**
 * Extends the song length by creating a temporary clip if needed.
 * Required when creating locators past the current song_length.
 * @param liveSet - The live_set LiveAPI object
 * @param targetBeats - Target position in beats
 * @param context - Context object with silenceWavPath
 * @param context.silenceWavPath - Path to silence.wav for audio track extension
 * @returns Cleanup info or null if no extension needed
 */
export function extendSongIfNeeded(
  liveSet: LiveAPI,
  targetBeats: number,
  context: { silenceWavPath?: string },
): TempClipInfo | null {
  const songLength = liveSet.get("song_length")[0] as number;

  if (targetBeats <= songLength) {
    return null; // No extension needed
  }

  // Find first track (prefer MIDI, fallback to audio)
  const trackIds = liveSet.getChildIds("tracks");
  let selectedTrack: LiveAPI | null = null;
  let isMidiTrack = false;

  for (const trackId of trackIds) {
    const track = LiveAPI.from(trackId);

    if ((track.getProperty("has_midi_input") as number) > 0) {
      selectedTrack = track;
      isMidiTrack = true;
      break;
    }

    // Keep first audio track as fallback
    selectedTrack ??= track;
  }

  if (!selectedTrack) {
    throw new Error(
      `Cannot create locator past song end: no tracks available to extend song`,
    );
  }

  if (isMidiTrack) {
    // Create temp MIDI clip in arrangement (1 beat minimum)
    const tempClipResult = selectedTrack.call(
      "create_midi_clip",
      targetBeats,
      1,
    ) as string;
    const tempClip = LiveAPI.from(tempClipResult);

    return { track: selectedTrack, clipId: tempClip.id, isMidiTrack: true };
  }

  // Audio track - need to create in session then duplicate to arrangement
  if (!context.silenceWavPath) {
    throw new Error(
      `Cannot create locator past song end: no MIDI tracks and silenceWavPath not available`,
    );
  }

  const { clip: sessionClip, slot } = createAudioClipInSession(
    selectedTrack,
    1, // 1 beat length
    context.silenceWavPath,
  );

  const arrangementClipResult = selectedTrack.call(
    "duplicate_clip_to_arrangement",
    `id ${sessionClip.id}`,
    targetBeats,
  ) as string;
  const arrangementClip = LiveAPI.from(arrangementClipResult);

  return {
    track: selectedTrack,
    clipId: arrangementClip.id,
    isMidiTrack: false,
    slot,
  };
}

/**
 * Cleans up the temporary clip created by extendSongIfNeeded.
 * @param tempClipInfo - Info from extendSongIfNeeded or null
 */
export function cleanupTempClip(tempClipInfo: TempClipInfo | null): void {
  if (!tempClipInfo) {
    return;
  }

  const { track, clipId, isMidiTrack, slot } = tempClipInfo;

  // Delete the arrangement clip
  track.call("delete_clip", `id ${clipId}`);

  // For audio clips, also delete the session clip
  if (!isMidiTrack && slot) {
    slot.call("delete_clip");
  }
}

/**
 * Parses a combined scale string like "C Major" into root note and scale name
 * @param scaleString - Scale in format "Root ScaleName"
 * @returns Parsed components
 */
export function parseScale(scaleString: string): {
  scaleRoot: string;
  scaleName: string;
} {
  const trimmed = scaleString.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    throw new Error(
      `Scale must be in format 'Root ScaleName' (e.g., 'C Major'), got: ${scaleString}`,
    );
  }

  const scaleRoot = parts[0] as string;
  const scaleNameParts = parts.slice(1);
  const scaleName = scaleNameParts.join(" ");
  const scaleRootLower = scaleRoot.toLowerCase();
  const scaleNameLower = scaleName.toLowerCase();

  const scaleRootIndex =
    VALID_PITCH_CLASS_NAMES_LOWERCASE.indexOf(scaleRootLower);

  if (scaleRootIndex === -1) {
    throw new Error(
      `Invalid scale root '${scaleRoot}'. Valid roots: ${VALID_PITCH_CLASS_NAMES.join(", ")}`,
    );
  }

  const scaleNameIndex = VALID_SCALE_NAMES_LOWERCASE.indexOf(scaleNameLower);

  if (scaleNameIndex === -1) {
    throw new Error(
      `Invalid scale name '${scaleName}'. Valid scales: ${VALID_SCALE_NAMES.join(", ")}`,
    );
  }

  return {
    scaleRoot: VALID_PITCH_CLASS_NAMES[scaleRootIndex] as string,
    scaleName: VALID_SCALE_NAMES[scaleNameIndex] as string,
  };
}

/**
 * Apply tempo to live set, with validation
 * @param liveSet - The live_set object
 * @param tempo - Tempo in BPM
 * @param result - Result object to update
 * @param result.tempo - Tempo property to set
 */
export function applyTempo(
  liveSet: LiveAPI,
  tempo: number,
  result: { tempo?: number },
): void {
  if (tempo < 20 || tempo > 999) {
    console.warn("tempo must be between 20.0 and 999.0 BPM");

    return;
  }

  liveSet.set("tempo", tempo);
  result.tempo = tempo;
}

/**
 * Apply scale to live set, with validation
 * @param liveSet - The live_set object
 * @param scale - Scale string (e.g., "C Major") or empty string to disable
 * @param result - Result object to update
 * @param result.scale - Scale property to set
 */
export function applyScale(
  liveSet: LiveAPI,
  scale: string,
  result: { scale?: string },
): void {
  if (scale === "") {
    liveSet.set("scale_mode", 0);
    result.scale = "";

    return;
  }

  const { scaleRoot, scaleName } = parseScale(scale);
  const scaleRootNumber = pitchClassToNumber(scaleRoot);

  if (scaleRootNumber == null) {
    console.warn(`invalid scale root: ${scaleRoot}`);

    return;
  }

  liveSet.set("root_note", scaleRootNumber);
  liveSet.set("scale_name", scaleName);
  liveSet.set("scale_mode", 1);
  result.scale = `${scaleRoot} ${scaleName}`;
}

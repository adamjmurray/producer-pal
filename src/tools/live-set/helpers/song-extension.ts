// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requireCreatedClip } from "#src/tools/clip/helpers/clip-results.ts";
import { clipFromDuplicateResult } from "#src/tools/shared/arrangement/helpers/arrangement-duplicate-result.ts";
import {
  createAudioClipInSession,
  removeSessionClip,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";

interface TempClipInfo {
  track: LiveAPI;
  clipId: string;
  isMidiTrack: boolean;
  slot?: LiveAPI;
  /** The scene made for the audio clip, to remove with it */
  sceneId?: string;
}

/**
 * Extends the song with a temp clip so a locator past song_length can be made.
 * @param liveSet - The live_set LiveAPI object
 * @param targetBeats - Target position in beats
 * @param context - Context object; its silenceWavPath extends an audio track
 * @returns Cleanup info or null if no extension needed
 */
export function extendSongIfNeeded(
  liveSet: LiveAPI,
  targetBeats: number,
  context: { silenceWavPath?: string },
): TempClipInfo | null {
  const songLength = liveSet.getProperty("song_length") as number;

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
    const tempClip = requireCreatedClip(
      LiveAPI.from(tempClipResult),
      pathPrefix(selectedTrack),
    );

    return { track: selectedTrack, clipId: tempClip.id, isMidiTrack: true };
  }

  // Audio track - need to create in session then duplicate to arrangement
  if (!context.silenceWavPath) {
    throw new Error(
      `Cannot create locator past song end: no MIDI tracks and silenceWavPath not available`,
    );
  }

  const {
    clip: sessionClip,
    slot,
    sceneId,
  } = createAudioClipInSession(
    selectedTrack,
    1, // 1 beat length
    context.silenceWavPath,
  );

  let arrangementClip: LiveAPI;

  try {
    arrangementClip = clipFromDuplicateResult(
      selectedTrack.call(
        "duplicate_clip_to_arrangement",
        toLiveApiId(sessionClip.id),
        targetBeats,
      ),
    );
  } catch (error) {
    // Nothing returns the session clip to be cleaned up later, so it goes now.
    // There is no entry to report on here, so a leftover is a warning.
    removeSessionClip({ slot, sceneId });

    throw error;
  }

  return {
    track: selectedTrack,
    clipId: arrangementClip.id,
    isMidiTrack: false,
    slot,
    ...(sceneId == null ? {} : { sceneId }),
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

  const { track, clipId, isMidiTrack, slot, sceneId } = tempClipInfo;

  // Delete the arrangement clip
  track.call("delete_clip", toLiveApiId(clipId));

  // For audio clips, also delete the session clip
  if (!isMidiTrack && slot) {
    removeSessionClip({ slot, sceneId });
  }
}

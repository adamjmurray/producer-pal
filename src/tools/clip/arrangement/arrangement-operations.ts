import * as console from "#src/shared/v8-max-console.js";
import {
  handleArrangementLengthening,
  handleArrangementShortening,
} from "./helpers/arrangement-operations-helpers.js";
import type { ArrangementContext } from "./helpers/arrangement-operations-helpers.js";

export interface ClipIdResult {
  id: string;
}

interface HandleArrangementLengthOperationArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  context: ArrangementContext;
}

/**
 * Handle arrangement length changes (lengthening via tiling/exposure or shortening)
 * @param args - Operation arguments
 * @param args.clip - The LiveAPI clip object
 * @param args.isAudioClip - Whether the clip is an audio clip
 * @param args.arrangementLengthBeats - Target length in beats
 * @param args.context - Tool execution context
 * @returns Array of clip result objects to add to updatedClips
 */
export function handleArrangementLengthOperation({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  context,
}: HandleArrangementLengthOperationArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    console.error(
      `Warning: arrangementLength parameter ignored for session clip (id ${clip.id})`,
    );

    return updatedClips;
  }

  // Get current clip dimensions
  const currentStartTime = clip.getProperty("start_time") as number;
  const currentEndTime = clip.getProperty("end_time") as number;
  const currentArrangementLength = currentEndTime - currentStartTime;

  // Check if shortening, lengthening, or same
  if (arrangementLengthBeats > currentArrangementLength) {
    // Lengthening via tiling or hidden content exposure
    const result = handleArrangementLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentStartTime,
      currentEndTime,
      context,
    });

    updatedClips.push(...result);
  } else if (arrangementLengthBeats < currentArrangementLength) {
    // Shortening: Use temp clip overlay pattern
    handleArrangementShortening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentStartTime,
      currentEndTime,
      context,
    });
  }

  return updatedClips;
}

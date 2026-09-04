// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { setParamIfEnabled } from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

interface MixerParams {
  gainDb?: number;
  pan?: number;
  panningMode?: string;
  leftPan?: number;
  rightPan?: number;
}

/**
 * Apply stereo panning and warn about invalid params
 * @param mixer - Mixer device object
 * @param track - The track being updated, for the warning
 * @param pan - Pan value
 * @param leftPan - Left pan value
 * @param rightPan - Right pan value
 */
function applyStereoPan(
  mixer: LiveAPI,
  track: LiveAPI,
  pan: number | undefined,
  leftPan: number | undefined,
  rightPan: number | undefined,
): void {
  if (pan != null) {
    const panning = mixer.child("panning");

    if (panning.exists()) {
      setParamIfEnabled(panning, "value", pan, "pan");
    }
  }

  if (leftPan != null || rightPan != null) {
    console.warn(
      `track ${targetLabel(track)} is in stereo panning mode, so leftPan/rightPan ` +
        "had no effect; set panningMode to 'split', or use pan",
    );
  }
}

/**
 * Apply split panning and warn about invalid params
 * @param mixer - Mixer device object
 * @param track - The track being updated, for the warning
 * @param pan - Pan value
 * @param leftPan - Left pan value
 * @param rightPan - Right pan value
 */
function applySplitPan(
  mixer: LiveAPI,
  track: LiveAPI,
  pan: number | undefined,
  leftPan: number | undefined,
  rightPan: number | undefined,
): void {
  if (leftPan != null) {
    const leftSplit = mixer.child("left_split_stereo");

    if (leftSplit.exists()) {
      setParamIfEnabled(leftSplit, "value", leftPan, "leftPan");
    }
  }

  if (rightPan != null) {
    const rightSplit = mixer.child("right_split_stereo");

    if (rightSplit.exists()) {
      setParamIfEnabled(rightSplit, "value", rightPan, "rightPan");
    }
  }

  if (pan != null) {
    console.warn(
      `track ${targetLabel(track)} is in split panning mode, so pan had no ` +
        "effect; set panningMode to 'stereo', or use leftPan/rightPan",
    );
  }
}

/**
 * Apply mixer properties (gain and panning) to a track
 * @param track - Track object
 * @param params - Mixer properties
 */
export function applyMixerProperties(
  track: LiveAPI,
  params: MixerParams,
): void {
  const { gainDb, pan, panningMode, leftPan, rightPan } = params;

  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return;
  }

  // Handle gain (independent of panning mode)
  if (gainDb != null) {
    const volume = mixer.child("volume");

    if (volume.exists()) {
      setParamIfEnabled(volume, "display_value", gainDb, "gainDb");
    }
  }

  // Get current panning mode
  const currentMode = mixer.getProperty("panning_mode");
  const currentIsSplit = currentMode === 1;

  // Set new panning mode if provided
  if (panningMode != null) {
    const newMode = panningMode === "split" ? 1 : 0;

    mixer.set("panning_mode", newMode);
  }

  // Determine effective mode for validation
  const effectiveMode = panningMode ?? (currentIsSplit ? "split" : "stereo");

  // Handle panning based on effective mode
  if (effectiveMode === "stereo") {
    applyStereoPan(mixer, track, pan, leftPan, rightPan);
  } else {
    applySplitPan(mixer, track, pan, leftPan, rightPan);
  }
}

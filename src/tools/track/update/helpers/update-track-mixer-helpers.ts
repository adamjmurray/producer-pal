// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type MixerApplied,
  setParamAndReadBack,
} from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import { roundGainDb, roundPan } from "#src/tools/shared/utils.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

interface MixerParams extends PanParams {
  gainDb?: number;
  panningMode?: string;
}

/** The pan values from a call, which apply in one panning mode or the other. */
interface PanParams {
  pan?: number;
  leftPan?: number;
  rightPan?: number;
}

/** What a track mixer write landed, read back off the track. */
export interface TrackMixerApplied extends MixerApplied {
  leftPan?: number;
  rightPan?: number;
}

/**
 * Apply mixer properties (gain and panning) to a track.
 *
 * The reported values are read back off the track, not echoed from the
 * arguments: Live clamps and snaps what it is given.
 * @param track - Track object
 * @param params - Mixer properties
 * @returns What landed, read back
 */
export function applyMixerProperties(
  track: LiveAPI,
  params: MixerParams,
): TrackMixerApplied {
  const { gainDb, pan, panningMode, leftPan, rightPan } = params;
  const applied: TrackMixerApplied = {};

  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return applied;
  }

  // Gain is independent of panning mode.
  setIfLanded(
    applied,
    "gainDb",
    writeMixerChild(mixer, "volume", "display_value", gainDb, {
      label: "gainDb",
      round: roundGainDb,
    }),
  );

  const currentIsSplit = mixer.getProperty("panning_mode") === 1;

  if (panningMode != null) {
    mixer.set("panning_mode", panningMode === "split" ? 1 : 0);
  }

  // The mode the pan params are written under: the one just set, else the
  // track's own.
  const effectiveMode = panningMode ?? (currentIsSplit ? "split" : "stereo");

  if (effectiveMode === "stereo") {
    applyStereoPan(mixer, track, applied, { pan, leftPan, rightPan });
  } else {
    applySplitPan(mixer, track, applied, { pan, leftPan, rightPan });
  }

  return applied;
}

/**
 * Apply stereo panning and warn about the split-only params
 * @param mixer - Mixer device object
 * @param track - The track being updated, for the warning
 * @param applied - Collects what landed
 * @param params - The pan values from the call
 */
function applyStereoPan(
  mixer: LiveAPI,
  track: LiveAPI,
  applied: TrackMixerApplied,
  params: PanParams,
): void {
  setIfLanded(
    applied,
    "pan",
    writeMixerChild(mixer, "panning", "value", params.pan, {
      label: "pan",
      round: roundPan,
    }),
  );

  if (params.leftPan != null || params.rightPan != null) {
    console.warn(
      `track ${targetLabel(track)} is in stereo panning mode, so leftPan/rightPan ` +
        "had no effect; set panningMode to 'split', or use pan",
    );
  }
}

/**
 * Apply split panning and warn about the stereo-only param
 * @param mixer - Mixer device object
 * @param track - The track being updated, for the warning
 * @param applied - Collects what landed
 * @param params - The pan values from the call
 */
function applySplitPan(
  mixer: LiveAPI,
  track: LiveAPI,
  applied: TrackMixerApplied,
  params: PanParams,
): void {
  setIfLanded(
    applied,
    "leftPan",
    writeMixerChild(mixer, "left_split_stereo", "value", params.leftPan, {
      label: "leftPan",
      round: roundPan,
    }),
  );

  setIfLanded(
    applied,
    "rightPan",
    writeMixerChild(mixer, "right_split_stereo", "value", params.rightPan, {
      label: "rightPan",
      round: roundPan,
    }),
  );

  if (params.pan != null) {
    console.warn(
      `track ${targetLabel(track)} is in split panning mode, so pan had no ` +
        "effect; set panningMode to 'stereo', or use leftPan/rightPan",
    );
  }
}

/**
 * Write one of the mixer's parameters and read it back. The parameter is only
 * looked up when there is something to write — every update-track call would
 * otherwise build all four.
 * @param mixer - Mixer device object
 * @param name - Which mixer child holds the parameter
 * @param property - Which property carries the value
 * @param value - Value to write, or undefined to leave it alone
 * @param naming - How to name the parameter in a warning, and how to round the
 *   read-back to the resolution reads report
 * @returns What the parameter now reads, or undefined when nothing was written
 */
function writeMixerChild(
  mixer: LiveAPI,
  name: string,
  property: "value" | "display_value",
  value: number | undefined,
  naming: { label: string; round: (value: number) => number },
): number | undefined {
  if (value == null) return undefined;

  const param = mixer.child(name);

  return param.exists()
    ? setParamAndReadBack(param, property, value, naming.label, naming.round)
    : undefined;
}

/**
 * Record a value that landed, leaving the field out when nothing was written
 * @param applied - Collects what landed
 * @param field - Which result field the value belongs to
 * @param landed - The value read back, or undefined when nothing was written
 */
function setIfLanded(
  applied: TrackMixerApplied,
  field: keyof TrackMixerApplied,
  landed: number | undefined,
): void {
  if (landed != null) applied[field] = landed;
}

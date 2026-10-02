// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MixerApplied,
  setParamAndReadBack,
} from "#src/tools/shared/device/helpers/param-writing.ts";
import {
  type TargetNotes,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  type PublishedValue,
  differsAtPublishedResolution,
  readBackDetail,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import { roundGainDb, roundPan } from "#src/tools/shared/helpers/rounding.ts";

/** The two ways a track pans, and which pan params apply in each. */
export type PanningMode = "stereo" | "split";

interface MixerParams extends PanParams {
  gainDb?: number;
  panningMode?: PanningMode;
}

/** The pan values from a call, which apply in one panning mode or the other. */
interface PanParams {
  pan?: number;
  leftPan?: number;
  rightPan?: number;
}

/**
 * What a track mixer write has to say. A value that landed as asked isn't here:
 * the caller already knows it.
 */
export interface TrackMixerApplied extends MixerApplied {
  leftPan?: PublishedValue;
  rightPan?: PublishedValue;
  /**
   * Only ever "split", and only when the call didn't set the mode itself:
   * stereo is what a caller assumes, split is the state they may never have
   * read.
   */
  panningMode?: "split";
  /** Which values Live kept differently from the ones asked for */
  detail?: string;
}

/** One mixer parameter to write, and how the result would name it. */
interface MixerWrite {
  /** The result field, which is also the param name the caller wrote */
  field: "gainDb" | "pan" | "leftPan" | "rightPan";
  /** Which mixer child holds the parameter */
  child: string;
  /** Which property carries the value */
  property: "value" | "display_value";
  requested: number | undefined;
  /** Rounds the read-back to the resolution reads publish */
  round: (value: number) => number;
}

/** A track's mixer write while it is still being collected. */
interface MixerReport {
  applied: TrackMixerApplied;
  /** Params whose read-back isn't the number asked for */
  changed: string[];
  /** Where a param that had no effect is refused */
  notes: TargetNotes;
}

/**
 * Apply mixer properties (gain and panning) to a track.
 *
 * Values are read back off the track, not echoed: Live clamps and snaps what it
 * is given. One that came back the same is left out of the result. A value
 * the track can't take is refused on its entry.
 * @param track - Track object
 * @param params - Mixer properties
 * @param notes - What the track's entry has to say, added to
 * @returns What didn't land as asked, read back
 */
export function applyMixerProperties(
  track: LiveAPI,
  params: MixerParams,
  notes: TargetNotes,
): TrackMixerApplied {
  const { gainDb, pan, panningMode, leftPan, rightPan } = params;
  const report: MixerReport = { applied: {}, changed: [], notes };

  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return report.applied;
  }

  // Gain is independent of panning mode.
  writeMixerParam(mixer, report, {
    field: "gainDb",
    child: "volume",
    property: "display_value",
    requested: gainDb,
    round: roundGainDb,
  });

  const currentIsSplit = mixer.getProperty("panning_mode") === 1;

  if (panningMode != null) {
    mixer.set("panning_mode", panningMode === "split" ? 1 : 0);
  }

  // The mode the pan params are written under: the one just set, else the
  // track's own.
  const effectiveMode = panningMode ?? (currentIsSplit ? "split" : "stereo");

  if (effectiveMode === "stereo") {
    applyStereoPan(mixer, report, { pan, leftPan, rightPan });
  } else {
    applySplitPan(mixer, report, { pan, leftPan, rightPan });
  }

  // Split is the mode a caller doesn't expect, and it decides which pan params
  // the call could reach. Stereo is what they already assume, so it goes unsaid.
  if (
    panningMode == null &&
    effectiveMode === "split" &&
    (pan ?? leftPan ?? rightPan) != null
  ) {
    report.applied.panningMode = "split";
  }

  return finishReport(report);
}

/**
 * Apply stereo panning, reporting the split-only params as having no effect
 * @param mixer - Mixer device object
 * @param report - Collects what the write has to say
 * @param params - The pan values from the call
 */
function applyStereoPan(
  mixer: LiveAPI,
  report: MixerReport,
  params: PanParams,
): void {
  writeMixerParam(mixer, report, {
    field: "pan",
    child: "panning",
    property: "value",
    requested: params.pan,
    round: roundPan,
  });

  if (params.leftPan != null || params.rightPan != null) {
    refuseTargetWork(
      report.notes,
      ["leftPan", "rightPan"],
      "leftPan/rightPan had no effect: they only apply in split panning " +
        "mode — set panningMode to 'split', or use pan",
    );
  }
}

/**
 * Apply split panning, reporting the stereo-only param as having no effect
 * @param mixer - Mixer device object
 * @param report - Collects what the write has to say
 * @param params - The pan values from the call
 */
function applySplitPan(
  mixer: LiveAPI,
  report: MixerReport,
  params: PanParams,
): void {
  writeMixerParam(mixer, report, {
    field: "leftPan",
    child: "left_split_stereo",
    property: "value",
    requested: params.leftPan,
    round: roundPan,
  });

  writeMixerParam(mixer, report, {
    field: "rightPan",
    child: "right_split_stereo",
    property: "value",
    requested: params.rightPan,
    round: roundPan,
  });

  if (params.pan != null) {
    refuseTargetWork(
      report.notes,
      ["pan"],
      "pan had no effect: it only applies in stereo panning mode — set " +
        "panningMode to 'stereo', or use leftPan/rightPan",
    );
  }
}

/**
 * Write one of the mixer's parameters, read it back, and report it only when
 * Live kept a different value. The parameter is only looked up when there is
 * something to write — every update-track call would otherwise build all four.
 *
 * A parameter something else owns is refused on the track's entry: Live takes
 * the write and ignores it, so silence here must mean the value landed.
 * @param mixer - Mixer device object
 * @param report - Collects what the write has to say
 * @param write - The parameter to write and how to name it
 */
function writeMixerParam(
  mixer: LiveAPI,
  report: MixerReport,
  write: MixerWrite,
): void {
  const { field, requested, round } = write;

  if (requested == null) {
    return;
  }

  const param = mixer.child(write.child);

  if (!param.exists()) {
    return;
  }

  const landed = setParamAndReadBack(
    param,
    write.property,
    requested,
    field,
    round,
    report.notes,
  );

  if (
    landed == null ||
    !differsAtPublishedResolution(requested, landed, round)
  ) {
    return;
  }

  report.applied[field] = landed;
  report.changed.push(field);
}

/**
 * Say on the entry which values Live kept differently
 * @param report - What the write collected
 * @returns The mixer fields for the track's result entry
 */
function finishReport(report: MixerReport): TrackMixerApplied {
  const changed = readBackDetail(report.changed);

  if (changed != null) {
    report.applied.detail = changed;
  }

  return report.applied;
}

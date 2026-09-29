// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { endMovesFirst } from "#src/tools/shared/clip/clip-region-writes.ts";

export interface ClipPropsToSet {
  name?: string;
  color?: string;
  signature_numerator?: number | null;
  signature_denominator?: number | null;
  looping?: boolean;
  loop_start?: number;
  loop_end?: number;
  start_marker?: number;
  end_marker?: number;
  [key: string]: string | number | boolean | null | undefined;
}

interface RegionProps {
  /** Write loop_end before loop_start (see endMovesFirst) */
  loopEndFirst: boolean;
  /** Write end_marker before start_marker (see endMovesFirst) */
  markerEndFirst: boolean;
  /** Start position in marker units */
  start: number | null;
  /** End position in marker units */
  end: number | null;
  /** Start marker position in marker units */
  startMarker: number | null;
  /** Whether the loop brace is being written */
  writesLoop: boolean;
  /** Whether end_marker is being written */
  writesEndMarker: boolean;
}

/**
 * Add the region properties in an order Live accepts: each pair's end goes
 * first only when endMovesFirst says so, then the starts, then the other ends.
 * @param propsToSet - Properties object to modify
 * @param region - Which properties to write, and where
 * @param region.loopEndFirst - Write loop_end before loop_start
 * @param region.markerEndFirst - Write end_marker before start_marker
 * @param region.start - Start position in marker units
 * @param region.end - End position in marker units
 * @param region.startMarker - Start marker position in marker units
 * @param region.writesLoop - Whether the loop brace is being written
 * @param region.writesEndMarker - Whether end_marker is being written
 */
function addRegionProperties(
  propsToSet: ClipPropsToSet,
  {
    loopEndFirst,
    markerEndFirst,
    start,
    end,
    startMarker,
    writesLoop,
    writesEndMarker,
  }: RegionProps,
): void {
  const addEnds = (first: boolean) => {
    if (end == null) {
      return;
    }

    if (writesLoop && loopEndFirst === first) {
      propsToSet.loop_end = end;
    }

    if (writesEndMarker && markerEndFirst === first) {
      propsToSet.end_marker = end;
    }
  };

  addEnds(true);

  if (writesLoop && start != null) {
    propsToSet.loop_start = start;
  }

  if (startMarker != null) {
    propsToSet.start_marker = startMarker;
  }

  addEnds(false);
}

export interface BuildClipPropertiesArgs {
  name?: string;
  color?: string;
  timeSignature?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
  startMarkerBeats: number | null;
  looping?: boolean;
  isLooping: boolean;
  startBeats: number | null;
  endBeats: number | null;
  currentLoopEnd: number;
  currentEndMarker: number;
  beatsPerMarkerUnit: number;
}

/**
 * Build properties map for setAll
 * @param args - Property building arguments
 * @param args.name - Clip name
 * @param args.color - Clip color
 * @param args.timeSignature - Time signature string
 * @param args.timeSigNumerator - Time signature numerator
 * @param args.timeSigDenominator - Time signature denominator
 * @param args.startMarkerBeats - Start marker position in beats
 * @param args.looping - Whether looping is enabled
 * @param args.isLooping - Current looping state
 * @param args.startBeats - Start position in beats
 * @param args.endBeats - End position in beats
 * @param args.currentLoopEnd - The clip's current loop_end in beats
 * @param args.currentEndMarker - The clip's current end_marker in beats
 * @param args.beatsPerMarkerUnit - Beats per marker unit (see markerBeatsPerUnit)
 * @returns Properties object ready for clip.setAll()
 */
export function buildClipPropertiesToSet({
  name,
  color,
  timeSignature,
  timeSigNumerator,
  timeSigDenominator,
  startMarkerBeats,
  looping,
  isLooping,
  startBeats,
  endBeats,
  currentLoopEnd,
  currentEndMarker,
  beatsPerMarkerUnit,
}: BuildClipPropertiesArgs): ClipPropsToSet {
  // The markers are seconds on an unwarped audio clip and beats everywhere
  // else. This is the only place that writes them, so it is the only place that
  // has to convert.
  const toMarker = (beats: number | null) =>
    beats == null ? null : beats / beatsPerMarkerUnit;

  const startMarker = toMarker(startMarkerBeats);
  const start = toMarker(startBeats);
  const end = toMarker(endBeats);

  const propsToSet: ClipPropsToSet = {
    name: name,
    color: color,
    signature_numerator: timeSignature != null ? timeSigNumerator : null,
    signature_denominator: timeSignature != null ? timeSigDenominator : null,
  };

  const markerEndFirst = endMovesFirst(startMarkerBeats, currentEndMarker);
  const region: RegionProps = {
    loopEndFirst: endMovesFirst(startBeats, currentLoopEnd),
    markerEndFirst,
    start,
    end,
    startMarker,
    writesLoop: (isLooping || looping == null) && looping !== false,
    // A looping clip still has to move end_marker when its start_marker is
    // going past it, or Live drops the start and playback begins at the old one.
    writesEndMarker:
      (!isLooping || looping === false || markerEndFirst) && end != null,
  };

  // The loop brace needs `looping` already on, and Live ignores a start_marker
  // while it is off. So switching looping off writes the markers first and
  // flips after; everything else flips first.
  if (looping === false) {
    addRegionProperties(propsToSet, region);
    propsToSet.looping = false;
  } else {
    propsToSet.looping = looping;
    addRegionProperties(propsToSet, region);
  }

  return propsToSet;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Stage 1: read the call once and refuse what can't be made, before Live is
// touched. Everything per clip that can be worked out from the args alone (the
// meter, the region, the notes) is settled here, so a bad one stops the call
// while there is still nothing to report.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { readLiveSetScaleMask } from "#src/tools/clip/helpers/scale-mask.ts";
import { resolveLocatorPositions } from "#src/tools/shared/locator/song-position.ts";
import { refuseDoubledPosition } from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type PairedLabels,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { type Call } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { buildClipPlans, type ClipPlan } from "../clip-plans.ts";
import {
  readSongMeter,
  type SongMeter,
  validateArrangementPositions,
} from "../clip-timing-context.ts";
import {
  type ClipDestinations,
  resolveCreateClipDestinations,
} from "../create-clip-destinations.ts";
import {
  refuseUnknownAuto,
  validateCreateClipParams,
  validatePositions,
} from "../create-clip-validation.ts";
import { type CreateClipArgs } from "./create-clip-args.ts";

/** One create-clip call, read once. */
export interface CreateClipCall {
  /** The args, with a blank `transforms` dropped and `loc:` positions resolved */
  args: CreateClipArgs;
  destinations: ClipDestinations;
  song: SongMeter;
  /** What each destination is built from, in call order */
  plans: ClipPlan[];
  /** The call's name and color lists, paired with its destinations */
  labels: PairedLabels;
  /** The Live Set's scale, read once when a transform needs it */
  scaleMask: number | undefined;
}

/**
 * Read a create-clip call and refuse it when it can't be made.
 * @param sent - The args as the tool received them
 * @param call - The call's shared state
 * @returns The call, read
 * @throws Error when a destination, list, param or position is refused
 */
export function parseCreateCall(
  sent: CreateClipArgs,
  call: Call,
): CreateClipCall {
  // A blank transforms string means "no transform": it would otherwise skip the
  // dropped-duplicates note while a whitespace-only one reached the parser.
  const transforms = sent.transforms?.trim() ? sent.transforms : null;

  // A "[...]" in path and arrangementStart are two spellings of one position,
  // so there is no combined reading.
  refuseDoubledPosition(sent.path, sent.arrangementStart, "path");

  const liveSet = LiveAPI.from(livePath.liveSet);
  // Every `loc:` position becomes the bar|beat it names, once, before the list
  // is split: everything downstream sees bar|beat and needs no Live Set.
  const arrangementStart =
    sent.arrangementStart == null
      ? null
      : resolveLocatorPositions(liveSet, sent.arrangementStart, {
          paramName: "arrangementStart",
        });
  const args: CreateClipArgs = { ...sent, transforms, arrangementStart };
  const destinations = resolveCreateClipDestinations(
    args,
    arrangementStart,
    call.ignored,
  );
  const { order } = destinations;

  validatePositions(destinations);
  refuseListsOffCount(destinations, args);
  validateCreateClipParams(args.notes ?? null, args.sampleFile ?? null);
  refuseUnknownAuto(args.auto ?? null);

  const song = readSongMeter(liveSet);
  // sampleFile, timeSignature, start, length and firstStart pair 1:1 with the
  // clips, so each gets its own sample, meter and region.
  const plans = buildClipPlans({
    count: order.length,
    song,
    sampleFile: args.sampleFile ?? null,
    timeSignature: args.timeSignature ?? null,
    start: args.start ?? null,
    length: args.length ?? null,
    firstStart: args.firstStart ?? null,
    looping: args.looping ?? null,
    notationString: args.notes ?? null,
    transformString: transforms,
    notation: call.ctx.notation,
  });
  const labels = pairLabels({
    noun: "clip",
    count: order.length,
    name: args.name ?? undefined,
    color: args.color ?? undefined,
  });

  // Before any clip or take lane exists: a position that won't parse, or is
  // past Live's last, has to stop the call while there is nothing to report.
  validateArrangementPositions(
    destinations.arrangementPositions,
    song.songTimeSigNumerator,
    song.songTimeSigDenominator,
  );

  return {
    args,
    destinations,
    song,
    plans,
    labels,
    scaleMask: transforms == null ? undefined : readLiveSetScaleMask(),
  };
}

// --- Helpers below main export ---

/**
 * Refuse a per-clip list that doesn't name one entry per clip, before any clip
 * is created.
 *
 * Checked against the clips the destinations make, not the raw path: one track
 * takes every arrangementStart position, so `"t0/s0,t1"` with two positions
 * makes three clips. A single clip is checked against the raw destination
 * params instead: a count of 1 is never a list, so a trailing comma
 * (`path: "t0/s0,"`) would otherwise hide a mismatch.
 * @param destinations - Where the clips go, already resolved
 * @param args - The call's args
 */
function refuseListsOffCount(
  destinations: ClipDestinations,
  args: CreateClipArgs,
): void {
  const { countedBy, order } = destinations;
  const counted =
    order.length > 1
      ? [{ ...countedBy, count: order.length }]
      : [
          {
            param: args.path != null ? "path" : "slot",
            value: args.path ?? args.slot,
            isPath: true,
            target: true,
          },
          {
            param: "arrangementStart",
            value: args.arrangementStart,
            target: true,
          },
        ];
  const lists = {
    name: args.name,
    color: args.color,
    sampleFile: args.sampleFile,
    timeSignature: args.timeSignature,
    start: args.start,
    length: args.length,
    firstStart: args.firstStart,
  };

  validateListLengths([
    ...counted,
    ...Object.entries(lists).map(([param, value]) => ({ param, value })),
  ]);
}

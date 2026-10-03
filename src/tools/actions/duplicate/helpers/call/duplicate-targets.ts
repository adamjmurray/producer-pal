// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The copies a duplicate call makes, one target each: every copy of every
// source, in the order the call named them. What a copy needs is settled here
// from reads alone, so the pipeline can weigh the copies against each other
// before the first is written.

import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import {
  type Call,
  type Cover,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type ClipDestinations } from "../clip/clip-destinations.ts";
import {
  refuseDuplicatePositionsPastCap,
  resolveDestinationAndWarn,
} from "../duplicate-destinations.ts";
import { laneSourceLookup } from "../sources/lane-sources.ts";
import { laneCopyDrafts } from "../sources/duplicate-tracks-to-lanes.ts";
import {
  arrangementLengthMeter,
  pairCopyLabels,
} from "../sources/copy-labels.ts";
import {
  planSources,
  resolveSourceClipDestinations,
  type SourceShare,
} from "../sources/source-plan.ts";
import { chainCopyDrafts } from "./drafts/chain-copy-drafts.ts";
import { liveObject, meterOf, scenePass, trackFor } from "./duplicate-run.ts";
import { clipCopyDrafts } from "./drafts/clip-copy-drafts.ts";
import {
  type CopyDraft,
  type DuplicateCall,
  type DuplicateRun,
  type DuplicateTarget,
} from "./duplicate-call-types.ts";
import {
  countedDrafts,
  sceneArrangementDrafts,
} from "./drafts/track-scene-drafts.ts";

/**
 * Name the copies the call makes. A source nothing can be copied from keeps
 * the places its copies would have had, each as a skip.
 * @param parsed - The call, as read
 * @param run - The call's shared state; told the sources and their destinations
 * @param call - The call's hooks' shared state
 * @returns One target per copy, in the order named
 * @throws Error when the call names destinations that can't be paired
 */
export function duplicateTargets(
  parsed: DuplicateCall,
  run: DuplicateRun,
  call: Call,
): DuplicateTarget[] {
  const { type, args } = parsed;
  const sources = planSources({
    type,
    id: parsed.id,
    path: parsed.path,
    toPath: parsed.toPath,
    toSlot: args.toSlot,
    arrangementStart: parsed.arrangementStart,
    startParam: parsed.startParam,
    onArrangement: parsed.onArrangement,
    // A lane copy takes a lane source, which the track lookup rejects.
    lookup: parsed.laneCopy ? laneSourceLookup : undefined,
    // A clip stays where it is while its copies are made, so one object serves
    // them all; every other source moves as copies land.
    objectOf: type === "clip" ? (id) => liveObject(run, id) : undefined,
  });

  run.sources = sources;

  // Resolve a clip's destination up front, so a bad path fails before anything
  // is created. Other types have no destination path.
  const clipDestinations =
    type === "clip"
      ? resolveSourceClipDestinations(sources, parsed.onArrangement)
      : null;

  run.clipDestinations = clipDestinations;

  // Before the first copy or lane: neither can be undone.
  if ((type === "clip" || type === "scene") && parsed.onArrangement) {
    refuseDuplicatePositionsPastCap(
      parsed.arrangementStart,
      parsed.startParam,
      clipDestinations,
    );
  }

  const destination = resolveDestinationAndWarn({
    type,
    clipDestinations: callClipDestinations(clipDestinations),
    toPath: parsed.toPath,
    arrangementStart: parsed.arrangementStart,
    arrangementLength: args.arrangementLength,
    takeLane: args.takeLane,
    takeLaneName: args.takeLaneName,
    laneCopy: parsed.laneCopy,
    toTakeLane: parsed.toTakeLane,
  });

  run.destination = destination;
  run.takeLaneName = args.takeLaneName;
  // A track or session scene copy is the same whichever destination it has.
  run.rerun =
    (type === "track" && !parsed.laneCopy) ||
    (type === "scene" && !parsed.onArrangement)
      ? "copy"
      : "destination";

  const drafts = copyDrafts(run, parsed, sources, clipDestinations, call);
  const labelFor = pairCopyLabels(
    args,
    drafts.length,
    arrangementLengthMeter(type, destination, args.arrangementLength, () =>
      meterOf(run),
    ),
  );
  const targets = drafts.map((draft, index): DuplicateTarget => {
    if (draft.skip != null) {
      return { named: draft.named, skip: draft.skip };
    }

    const label = labelFor(index);
    const made = draft.make(label);

    return {
      named: made.named ?? draft.named,
      // One copy has no other to go over.
      covers: drafts.length > 1 ? readCovers(made.covers) : undefined,
      data: { body: made.body, label },
    };
  });

  warnUnusedTakeLaneName(parsed, destination, run.namesTakeLane, call);

  return targets;
}

// --- Helpers below main export ---

/**
 * One draft per copy the call makes, by what is being copied.
 * @param run - The call's shared state
 * @param parsed - The call, as read
 * @param sources - The sources, with their shares of the destinations
 * @param clipDestinations - Where each clip source's copies go, for a clip call
 * @param call - The call's shared state
 * @returns The drafts, a source's copies together
 */
function copyDrafts(
  run: DuplicateRun,
  parsed: DuplicateCall,
  sources: SourceShare[],
  clipDestinations: ClipDestinations[] | null,
  call: Call,
): CopyDraft[] {
  const { type } = parsed;

  if (parsed.laneCopy) {
    return laneCopyDrafts(sources);
  }

  if (clipDestinations != null) {
    return clipCopyDrafts(sources, clipDestinations, {
      takeLane: parsed.args.takeLane,
      objectOf: (id) => liveObject(run, id),
      trackOf: (trackIndex) => trackFor(run, trackIndex),
      meter: () => meterOf(run),
      laneNamed: () => {
        run.namesTakeLane = true;
      },
      ignored: call.ignored,
    });
  }

  if (type === "device" || type === "chain" || type === "drum-pad") {
    return chainCopyDrafts(type, sources);
  }

  return type === "scene" && parsed.onArrangement
    ? sceneArrangementDrafts(sources, parsed.count, {
        meter: meterOf(run),
        sceneOf: (id) => scenePass(run, id),
        withoutClips: parsed.withoutClips === true,
      })
    : countedDrafts(type as "track" | "scene", sources, parsed.count);
}

/**
 * The one source's destinations that speak for the call's warnings, which are
 * about the params rather than the places: one bound for the arrangement when
 * any is, since that one reads the arrangement params.
 * @param clipDestinations - One destination set per source, or null
 * @returns The destinations that speak for the call, or null
 */
function callClipDestinations(
  clipDestinations: ClipDestinations[] | null,
): ClipDestinations | null {
  return (
    clipDestinations?.find((each) => each.destination === "arrangement") ??
    clipDestinations?.[0] ??
    null
  );
}

/**
 * Says takeLaneName did nothing when no clip copy lands on a lane that could
 * take it.
 * @param parsed - The call, as read
 * @param destination - Where the call's copies go
 * @param onLane - Whether any destination the call named is a take lane,
 *   one that was refused included
 * @param call - The call's shared state
 */
function warnUnusedTakeLaneName(
  parsed: DuplicateCall,
  destination: string | undefined,
  onLane: boolean,
  call: Call,
): void {
  if (
    parsed.type !== "clip" ||
    destination !== "arrangement" ||
    !paramNamesSomething(parsed.args.takeLaneName)
  ) {
    return;
  }

  if (!onLane) {
    call.ignored("takeLaneName", "no destination names a take lane");
  }
}

/**
 * What a copy writes over. A source that can't be read says nothing: the copy
 * itself fails when its turn comes, and reports why.
 * @param covers - Reads what the copy goes over
 * @returns What it goes over, if that could be read
 */
function readCovers(
  covers: (() => Cover[] | undefined) | undefined,
): Cover[] | undefined {
  try {
    return covers?.();
  } catch {
    return undefined;
  }
}

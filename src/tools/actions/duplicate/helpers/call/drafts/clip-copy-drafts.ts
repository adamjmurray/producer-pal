// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The copies a clip call makes: one per destination its sources name, a clip
// slot or a spot on the arrangement. What can be known without writing is known
// here — a destination that can't take the copy keeps its slot as a skip, and a
// copy says what it writes over, so a later one that goes over it can be seen.

import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import {
  aliasTakeLane,
  isTakeLaneClip,
  isTakeLaneRequested,
  takeLaneLabel,
  takeLaneTargetsThatFit,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { canRecreateClip } from "#src/tools/shared/clip/recreate-clip.ts";
import {
  arrangementPositionPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { refuseNamedTwice } from "#src/tools/shared/helpers/param-presence.ts";
import { type SongMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { type Cover } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { parseArrangementLength } from "../../clip/arrangement-length.ts";
import { type ClipDestinations } from "../../clip/clip-destinations.ts";
import { destinationPath } from "../../clip/copy-entries.ts";
import { planCopies } from "../../clip/copy-plan.ts";
import {
  arrangementPositionToBeats,
  resolveArrangementPositions,
  resolveDestinationTargets,
  type ResolvedDestinations,
} from "../../duplicate-destinations.ts";
import { type SourceShare } from "../../sources/source-plan.ts";
import {
  type ArrangementCopy,
  type CopyDraft,
  type CopyLabel,
} from "../duplicate-call-types.ts";

/** What the clip copies are told about the call. */
export interface ClipDraftParams {
  takeLane: number | string | undefined;
  /** Looks a source up, once for the call */
  objectOf: (id: string) => LiveAPI;
  /** Looks a destination track up, once for the call */
  trackOf: (trackIndex: number) => LiveAPI;
  /** The song's time signature, read once for the call */
  meter: () => SongMeter;
  /** Says a destination of the call is a take lane */
  laneNamed: () => void;
}

/**
 * One draft per destination of each clip source, in the order named.
 * @param sources - The sources, in call order
 * @param destinations - One destination set per source
 * @param params - What the clip copies are told about the call
 * @returns The drafts, a source's destinations together
 */
export function clipCopyDrafts(
  sources: SourceShare[],
  destinations: ClipDestinations[],
  params: ClipDraftParams,
): CopyDraft[] {
  return sources.flatMap((source, index) => {
    const where = destinations[index] as ClipDestinations;

    return where.destination === "session"
      ? slotDrafts(source, index, where.slots, params)
      : arrangementDrafts(source, index, where, params);
  });
}

// --- Helpers below main export ---

/**
 * A copy addressed by the path it would report.
 * @param path - Where it is headed
 * @returns The address of its skip entry
 */
function addressed(path: string): NamedTarget {
  return { param: "path", value: path };
}

/**
 * Why a clip can't be copied into a slot on this track, or null when it can.
 * @param clip - The source clip
 * @param slot - The destination slot
 * @param params - What the clip copies are told about the call
 * @returns The reason, or null
 */
function slotBlocker(
  clip: LiveAPI,
  slot: ClipSlotPosition,
  params: ClipDraftParams,
): string | null {
  // An arrangement clip is re-created into the slot, from its notes or sample.
  if (clip.sceneIndex == null && !canRecreateClip(clip)) {
    return "it's an audio clip with no sample file; drag it in Live's UI";
  }

  return clipCopyBlocker(
    (clip.getProperty("is_midi_clip") as number) > 0,
    slot.trackIndex,
    params.trackOf(slot.trackIndex),
  );
}

/**
 * The drafts of a source copied into clip slots.
 * @param source - The source
 * @param turn - The source's turn in the call
 * @param slots - Its destination slots, in order
 * @param params - What the clip copies are told about the call
 * @returns One draft per slot
 */
function slotDrafts(
  source: SourceShare,
  turn: number,
  slots: ClipSlotPosition[],
  params: ClipDraftParams,
): CopyDraft[] {
  const clip = source.skip == null ? params.objectOf(source.id) : null;

  return slots.map((slot): CopyDraft => {
    const path = slotPath(slot.trackIndex, slot.sceneIndex);
    const blocker = clip == null ? null : slotBlocker(clip, slot, params);

    if (source.skip != null || blocker != null) {
      return {
        named: addressed(path),
        skip: source.skip ?? (blocker as string),
      };
    }

    return {
      named: addressed(path),
      make: () => ({
        body: { kind: "slot", sourceId: source.id, turn, slot },
        covers: () => [{ slot: path }],
      }),
    };
  });
}

/** What a source's arrangement copies have in common. */
interface ArrangementSource {
  share: SourceShare;
  clip: LiveAPI | null;
  noSample: string | null;
  canPromote: boolean;
}

/**
 * The drafts of a source copied onto the arrangement, one per destination.
 * @param share - The source
 * @param turn - The source's turn in the call
 * @param where - Where its copies go
 * @param params - What the clip copies are told about the call
 * @returns One draft per destination, in the order named
 * @throws Error when toPath names a take lane and takeLane names one too
 */
function arrangementDrafts(
  share: SourceShare,
  turn: number,
  where: ClipDestinations,
  params: ClipDraftParams,
): CopyDraft[] {
  const clip = share.skip == null ? params.objectOf(share.id) : null;
  const resolved =
    clip == null
      ? unresolvedDestinations(where.arrangementTargets)
      : resolveDestinationTargets(clip, where.arrangementTargets);
  const requested = aliasTakeLane(resolved.destinations, params.takeLane);

  // Decided from what toPath named, not from what could be resolved: a lane
  // on a blocked destination is still a lane the caller named.
  if (isTakeLaneRequested(params.takeLane)) {
    refuseNamedTwice({
      param: "toPath",
      value: where.arrangementTargets.some((target) => target?.takeLane != null)
        ? "t<n>/l<n>"
        : null,
      noun: "take lane",
      also: { takeLane: params.takeLane },
    });
  }

  if (requested.some((target) => target?.takeLane != null)) {
    params.laneNamed();
  }

  const meter = params.meter();
  const positions = positionsInBeats(share.arrangementStart, where, meter);
  const plan = planCopies(requested, positions);
  const dropped = takeLaneTargetsThatFit(
    plan.targets.filter((target) => target.takeLane != null),
  ).dropped;
  const source: ArrangementSource = {
    share,
    clip,
    noSample:
      clip == null || canRecreateClip(clip)
        ? null
        : "it's an audio clip with no sample file; drag it in Live's UI",
    canPromote:
      clip != null &&
      isTakeLaneClip(clip) &&
      plan.targets.some((target) => target.takeLane == null) &&
      canRecreateClip(clip),
  };

  return Array.from({ length: plan.copies }, (_, request): CopyDraft => {
    // Padded to one entry per copy asked for, and every position is a number.
    const target = plan.requestedTargets[request] as ArrangementTrack | null;
    const beats = plan.requestedPositions[request] as number;
    const label = destinationLabel(
      where.arrangementTargets[request],
      target,
      resolved.destinations[request],
    );
    const slot = where.arrangementRefusals[request];
    const named = addressed(
      slot == null
        ? destinationPath(
            { beats, label },
            {
              songTimeSigNumerator: meter.numerator,
              songTimeSigDenominator: meter.denominator,
            },
          )
        : (slot.path as string),
    );

    if (share.skip != null) {
      return { named, skip: share.skip };
    }

    if (slot != null) {
      return { named, skip: slot.detail };
    }

    // A destination that can't take the copy says why.
    if (target == null) {
      return { named, skip: resolved.refusals[request] as string };
    }

    const refused = arrangementRefusal(source, target, dropped);

    if (refused != null) {
      return { named, skip: refused };
    }

    return {
      named,
      make: (copyLabel) => ({
        body: {
          kind: "arrangement",
          sourceId: share.id,
          turn,
          target,
          startBeats: beats,
        } satisfies ArrangementCopy,
        covers: () =>
          arrangementCovers(clip as LiveAPI, target, beats, copyLabel, meter),
      }),
    };
  });
}

/**
 * Why a copy can't be made at an arrangement destination, known before any
 * write.
 * @param source - The source's copies
 * @param target - Where this copy lands
 * @param dropped - Why each take lane that won't fit doesn't, by its path
 * @returns The reason, or null when the copy can be tried
 */
function arrangementRefusal(
  source: ArrangementSource,
  target: ArrangementTrack,
  dropped: Map<string, string>,
): string | null {
  if (target.takeLane != null) {
    return source.noSample ?? dropped.get(takeLaneLabel(target)) ?? null;
  }

  // Live's arrangement duplicate silently no-ops on a take-lane source, so it
  // is re-created, which not every source can be. A planned main-lane copy
  // that can't be promoted has only the one reason.
  if (
    source.clip != null &&
    isTakeLaneClip(source.clip) &&
    !source.canPromote
  ) {
    return source.noSample;
  }

  return null;
}

/**
 * The stretch of lane an arrangement copy writes over.
 * @param clip - The source clip
 * @param target - Where the copy lands
 * @param startBeats - Where it starts, in Ableton beats
 * @param label - What the call asked of this copy
 * @param meter - The song's time signature
 * @returns What it covers, or undefined when its length can't be known
 */
function arrangementCovers(
  clip: LiveAPI,
  target: ArrangementTrack,
  startBeats: number,
  label: CopyLabel,
  meter: SongMeter,
): Cover[] | undefined {
  const { numerator, denominator } = meter;
  const own =
    clip.sceneIndex == null
      ? (clip.getProperty("end_time") as number) -
        (clip.getProperty("start_time") as number)
      : clipLengthBeats(clip);
  // A re-created copy is never resized, so only a duplicate takes the length.
  const recreated = target.takeLane != null || isTakeLaneClip(clip);
  const span =
    label.length == null || recreated
      ? own
      : lengthReach(
          parseArrangementLength(label.length, numerator, denominator),
          own,
          clipLengthBeats(clip),
        );

  if (!Number.isFinite(span) || span <= 0) {
    return undefined;
  }

  return [
    {
      lane: takeLaneLabel(target),
      from: startBeats,
      to: startBeats + span,
      as: arrangementPositionPath(arrangementLaneOf(target), startBeats, meter),
    },
  ];
}

/**
 * How far a length-asked copy clears. One shorter than the clip's own length is
 * cut to size off to the side first, so it clears just that. Otherwise Live's
 * duplicate lands the whole clip, clearing all of its extent, before it is
 * lengthened or trimmed.
 * @param beats - The length asked for
 * @param own - The source's extent on its lane
 * @param clipLength - The source's own length
 * @returns The span the copy clears, in beats
 */
function lengthReach(beats: number, own: number, clipLength: number): number {
  return beats < clipLength ? beats : Math.max(beats, own);
}

/**
 * The destinations of a source nothing can be copied from. No clip says which
 * track a bare `[5|1]` means, so such an entry has no lane to name.
 * @param targets - The destinations as toPath named them
 * @returns The same destinations, unchecked
 */
function unresolvedDestinations(
  targets: ClipDestinations["arrangementTargets"],
): ResolvedDestinations {
  if (targets.length === 0) {
    return { destinations: [null], refusals: [null] };
  }

  return {
    destinations: targets.map((target) =>
      target?.trackIndex == null
        ? null
        : { trackIndex: target.trackIndex, takeLane: target.takeLane },
    ),
    refusals: targets.map(() => null),
  };
}

/**
 * How a destination that got no copy is addressed: from the toPath entry that
 * named it, or from the resolved destination where the path left the track out.
 * @param named - The destination as toPath named it
 * @param paired - The destination as planned, if it was
 * @param resolved - The same destination resolved, if it resolved
 * @returns The lane part of the path
 */
function destinationLabel(
  named: ClipDestinations["arrangementTargets"][number] | undefined,
  paired: ArrangementTrack | null,
  resolved: ArrangementTrack | null | undefined,
): string {
  const trackIndex =
    named?.trackIndex ?? paired?.trackIndex ?? resolved?.trackIndex;

  return trackIndex == null
    ? ""
    : takeLaneLabel({
        trackIndex,
        takeLane:
          named?.takeLane ?? paired?.takeLane ?? resolved?.takeLane ?? null,
      });
}

/**
 * The positions the copies land on, in Ableton beats: from the `[...]`
 * coordinates in toPath when it carried any, and from arrangementStart
 * otherwise. Only one of the two is ever in play: a call sending both is
 * refused before it starts.
 * @param arrangementStart - Comma-separated bar|beat positions
 * @param destinations - The destinations, with the position each one's own
 *   `[...]` named
 * @param meter - The song's time signature
 * @returns One position per entry
 */
function positionsInBeats(
  arrangementStart: string | undefined,
  destinations: ClipDestinations,
  meter: SongMeter,
): number[] {
  const { numerator, denominator } = meter;
  const pathPositions = destinations.arrangementPositions;
  const targets = destinations.arrangementTargets;
  // A source whose every entry is a refused clip slot lands nothing, so it
  // needs no position — and may have none, when the others came from toPath.
  const fromPath =
    pathPositions.some((position) => position != null) ||
    (targets.length > 0 && targets.every((target) => target == null));

  if (!fromPath) {
    // Comma-separated for multiple; shared with scene duplication.
    return resolveArrangementPositions(
      arrangementStart,
      numerator,
      denominator,
    );
  }

  return pathPositions.map((position) =>
    // A dropped entry — a clip slot in an arrangement toPath — keeps its turn so
    // names and colors stay aligned, and its position is never read.
    position == null
      ? 0
      : arrangementPositionToBeats(position, numerator, denominator),
  );
}

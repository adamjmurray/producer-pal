// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Sources run in call order, so a copy landing on a later source of the same
// call either destroys it before its turn or changes what its turn copies. The
// call is refused before anything is made. A copy onto an earlier
// source lands after its turn, so it goes ahead. Only clips, drum pads and lane
// copies can land on something: every other copy is inserted.

import { takeLaneLabel } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  pathEntries,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type DuplicateTarget } from "../call/duplicate-call-types.ts";
import {
  resolvePadTarget,
  resolveSourcePad,
  type PadTarget,
} from "../device/duplicate-drum-pad.ts";
import { type SourceShare } from "./source-plan.ts";

/** A lane copy's source, and where its clips go. */
export interface LaneCopySource {
  id: string;
  named: NamedTarget;
  /** The lane its clips sit on, as "t2" or "t2/l0", or null when unknown. */
  place: string | null;
  clips: LiveAPI[];
  /** Its planned destinations; one with no target gets no copy. */
  copies: { entry: string; target?: { label: string } }[];
}

/**
 * Refuses a clip call when a copy would land on a later source. Each copy says
 * what it goes over, so nothing is replanned here.
 * @param targets - The call's copies, in the order named
 * @param sources - The call's sources, in order
 * @throws Error naming the first copy that would
 */
export function refuseClipOverwrites(
  targets: DuplicateTarget[],
  sources: SourceShare[],
): void {
  if (sources.length < 2) {
    return;
  }

  const turnOf = new Map(sources.map((share, turn) => [share.id, turn]));
  const copies = targets.flatMap(({ named, covers, data }): CopyPlace[] => {
    const body = data?.body;

    if (body == null || (body.kind !== "slot" && body.kind !== "arrangement")) {
      return [];
    }

    return (covers ?? []).map((cover) => ({
      sourceId: body.sourceId,
      turn: turnOf.get(body.sourceId) as number,
      destination: named.value,
      place: "slot" in cover ? cover.slot : cover.lane,
      spans: () =>
        "slot" in cover ? null : [{ start: cover.from, end: cover.to }],
    }));
  });

  refuseOverlaps(
    sources.flatMap((share, turn) =>
      share.skip == null
        ? clipSourcePlace(share, LiveAPI.from(share.id), turn)
        : [],
    ),
    copies,
  );
}

/**
 * Refuses a drum-pad call when a copy would land on a later source pad.
 * copy_pad layers, so that pad's own turn would copy both.
 * @param sources - The call's sources, in order
 * @throws Error naming the first copy that would
 */
export function refusePadOverwrites(sources: SourceShare[]): void {
  if (sources.length < 2) {
    return;
  }

  refuseOverlaps(
    sources.flatMap((share, turn) => padSourcePlace(share, turn)),
    sources.flatMap((share, turn) => padCopyPlaces(share, turn)),
  );
}

/**
 * Refuses a lane copy when a source's clips would land over a later source's.
 * @param sources - Every source, with its planned destinations
 * @throws Error naming the first destination that would
 */
export function refuseLaneOverwrites(sources: LaneCopySource[]): void {
  if (sources.length < 2) {
    return;
  }

  refuseOverlaps(
    sources.flatMap(({ id, named, place, clips }, turn) =>
      place == null ? [] : [{ id, named, turn, place, spans: spansOf(clips) }],
    ),
    sources.flatMap(({ id, clips, copies }, turn) =>
      copies.flatMap(({ entry, target }) =>
        target == null
          ? []
          : [
              {
                sourceId: id,
                turn,
                destination: entry,
                place: target.label,
                spans: spansOf(clips),
              },
            ],
      ),
    ),
  );
}

// --- Helpers below main exports ---

/**
 * Lazily reads where lane clips land: each at the position it already has.
 * @param clips - The source's clips
 * @returns A reader for their spans
 */
function spansOf(clips: LiveAPI[]): () => Span[] {
  return () => clips.map(clipSpan);
}

/** A stretch of an arrangement lane, in beats: start inclusive, end not. */
interface Span {
  start: number;
  end: number;
}

/** Where a source sits: a clip slot, an arrangement lane, or a drum pad. */
interface SourcePlace {
  id: string;
  named: NamedTarget;
  /** Its turn in the call, from 0. */
  turn: number;
  place: string;
  /** Its stretch of the lane, or null when it fills the place. Read only when
   * a copy lands on the same place: it costs Live reads. */
  spans: () => Span[] | null;
}

/** Where one copy lands. */
interface CopyPlace {
  sourceId: string;
  /** Its source's turn in the call. */
  turn: number;
  /** Where it goes, for the error. */
  destination: string;
  place: string;
  spans: () => Span[] | null;
}

/**
 * Throws for the first copy that lands on a source whose turn is still to come.
 * A source's copy onto its own place is not this: each copier handles that
 * one.
 * @param sources - Where each source sits
 * @param copies - Where each copy lands
 */
function refuseOverlaps(sources: SourcePlace[], copies: CopyPlace[]): void {
  for (const copy of copies) {
    const hit = sources.find(
      (source) =>
        source.id !== copy.sourceId &&
        source.turn > copy.turn &&
        source.place === copy.place &&
        overlaps(source.spans(), copy.spans()),
    );

    if (hit != null) {
      throw new Error(
        `a copy to "${copy.destination}" would overwrite ${hit.named.param} ` +
          `"${hit.named.value}", another source of this call; list it ` +
          `before this one, or duplicate it in its own call first`,
      );
    }
  }
}

/**
 * Whether two footprints on one place collide. Touching ends don't: a copy
 * ending where a source starts leaves it whole.
 * @param a - One footprint, null when it fills the place
 * @param b - The other
 * @returns True when they share any of the place
 */
function overlaps(a: Span[] | null, b: Span[] | null): boolean {
  if (a == null || b == null) {
    return true;
  }

  return a.some((x) => b.some((y) => x.start < y.end && y.start < x.end));
}

/**
 * Where a source clip sits: its slot, or its stretch of an arrangement lane.
 * @param share - The source's turn
 * @param clip - The source clip
 * @param turn - Its turn in the call
 * @returns Its place
 */
function clipSourcePlace(
  share: SourceShare,
  clip: LiveAPI,
  turn: number,
): SourcePlace[] {
  const { id, named } = share;
  // A clip that was found always sits on a regular track.
  const trackIndex = clip.trackIndex as number;
  const sceneIndex = clip.sceneIndex;

  if (sceneIndex != null) {
    const place = slotPath(trackIndex, sceneIndex);

    return [{ id, named, turn, place, spans: () => null }];
  }

  const place = takeLaneLabel({ trackIndex, takeLane: clip.takeLaneIndex });

  return [{ id, named, turn, place, spans: () => [clipSpan(clip)] }];
}

/**
 * Where a source pad sits.
 * @param share - The source's turn
 * @param turn - Its turn in the call
 * @returns Its place, or none for a chain, which its own entries refuse
 */
function padSourcePlace(share: SourceShare, turn: number): SourcePlace[] {
  const pad = LiveAPI.from(share.id);

  if (pad.type !== "DrumPad") {
    return [];
  }

  return [
    {
      id: share.id,
      named: share.named,
      turn,
      place: padPlace(resolveSourcePad(pad)),
      spans: () => null,
    },
  ];
}

/**
 * Where one source's pad copies land.
 * @param share - The source's turn
 * @param turn - Its turn in the call
 * @returns One place per destination that names a pad
 */
function padCopyPlaces(share: SourceShare, turn: number): CopyPlace[] {
  return pathEntries(share.toPath, "toPath").flatMap((entry) => {
    const pad = padAt(entry);

    return pad == null
      ? []
      : [
          {
            sourceId: share.id,
            turn,
            destination: entry,
            place: padPlace(pad),
            spans: () => null,
          },
        ];
  });
}

/**
 * The pad a destination names, or null when it names none.
 * @param entry - One toPath entry
 * @returns The pad
 */
function padAt(entry: string): PadTarget | null {
  // A destination that names no pad is refused on its own entry.
  try {
    return resolvePadTarget(entry, "toPath");
  } catch {
    return null;
  }
}

/**
 * The key two pads share when they are the same pad.
 * @param pad - The pad
 * @returns Its place
 */
function padPlace(pad: PadTarget): string {
  return `${pad.rackPath} pad ${pad.midi}`;
}

/**
 * An arrangement clip's stretch of its lane.
 * @param clip - The clip
 * @returns Its span
 */
function clipSpan(clip: LiveAPI): Span {
  return {
    start: clip.getProperty("start_time") as number,
    end: clip.getProperty("end_time") as number,
  };
}

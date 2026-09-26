// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Sources run in call order, so a copy landing on a later source of the same
// call either destroys it before its turn or changes what its turn copies. The
// call is refused before anything is made (ADR-0035). A copy onto an earlier
// source lands after its turn, so it goes ahead. Only clips, drum pads and lane
// copies can land on something: every other copy is inserted.

import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import {
  aliasTakeLane,
  isTakeLaneClip,
  takeLaneLabel,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  pathEntries,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  songMeter,
  type SongMeter,
} from "#src/tools/shared/validation/helpers/song-meter.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { parseArrangementStartList } from "#src/tools/shared/validation/position-parsing.ts";
import { parseArrangementLength } from "../clip/arrangement-length.ts";
import { type ClipDestinations } from "../clip/clip-destinations.ts";
import { arrangementPositionToBeats } from "../duplicate-destinations.ts";
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
 * Refuses a clip call when a copy would land on a later source.
 * @param sources - The call's sources, in order
 * @param clipDestinations - One destination set per source
 * @param params - The call's params that move or size a copy
 * @param params.arrangementLength - Span per copy, when given
 * @param params.takeLane - The deprecated takeLane param
 * @throws Error naming the first copy that would
 */
export function refuseClipOverwrites(
  sources: SourceShare[],
  clipDestinations: ClipDestinations[],
  params: {
    arrangementLength: string | undefined;
    takeLane: number | string | undefined;
  },
): void {
  if (sources.length < 2) {
    return;
  }

  const perSource = sources.map((share, i) => {
    const clip = LiveAPI.from(share.id);
    const destinations = clipDestinations[i] as ClipDestinations;

    return {
      share,
      clip,
      planned: plannedCopies(clip, share, destinations, params.takeLane),
    };
  });
  // arrangementLength runs across every copy of the call, in order.
  const { arrangementLength } = params;
  const total = perSource.reduce((sum, { planned }) => sum + planned.length, 0);
  const length = (index: number): string | undefined =>
    valueForIndex(
      arrangementLength,
      index,
      splitList(arrangementLength, total, "arrangementLength"),
    );
  let offset = 0;
  const copies = perSource.flatMap(({ share, clip, planned }, turn) => {
    const first = offset;

    offset += planned.length;

    return planned.flatMap((copy, j): CopyPlace[] =>
      copy == null
        ? []
        : [
            {
              sourceId: share.id,
              turn,
              destination: copy.destination,
              place: copy.place,
              spans: () => copySpans(clip, copy, length(first + j)),
            },
          ],
    );
  });

  refuseOverlaps(
    perSource.flatMap(({ share, clip }, turn) =>
      clipSourcePlace(share, clip, turn),
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

  // Each clip lands at the position it already has.
  const spansOf = (clips: LiveAPI[]) => (): Span[] => clips.map(clipSpan);

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

/** One clip copy, before it is made. */
interface PlannedCopy {
  place: string;
  destination: string;
  /** Its bar|beat start and lane, for an arrangement copy. */
  arrangement: { position: string; target: ArrangementTrack } | null;
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
 * @returns Its place, or none when it has no track
 */
function clipSourcePlace(
  share: SourceShare,
  clip: LiveAPI,
  turn: number,
): SourcePlace[] {
  const { id, named } = share;
  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null) {
    return [];
  }

  if (sceneIndex != null) {
    const place = slotPath(trackIndex, sceneIndex);

    return [{ id, named, turn, place, spans: () => null }];
  }

  const place = takeLaneLabel({ trackIndex, takeLane: clip.takeLaneIndex });

  return [{ id, named, turn, place, spans: () => [clipSpan(clip)] }];
}

/**
 * Every copy one source asks for, null where a destination gets none — kept so
 * the copy count lines up with arrangementLength.
 * @param clip - The source clip
 * @param share - The source's turn
 * @param destinations - Where its copies go
 * @param takeLane - The deprecated takeLane param
 * @returns One entry per copy
 */
function plannedCopies(
  clip: LiveAPI,
  share: SourceShare,
  destinations: ClipDestinations,
  takeLane: number | string | undefined,
): (PlannedCopy | null)[] {
  if (destinations.destination === "session") {
    return destinations.slots.map(({ trackIndex, sceneIndex }) => {
      const place = slotPath(trackIndex, sceneIndex);

      return { place, destination: place, arrangement: null };
    });
  }

  const targets = arrangementTargets(
    clip,
    destinations.arrangementTargets,
    takeLane,
  );
  const positions = destinations.arrangementPositions.some((p) => p != null)
    ? destinations.arrangementPositions
    : parseArrangementStartList(share.arrangementStart);
  const count = Math.max(targets.length, positions.length);

  return Array.from({ length: count }, (_, i) => {
    const target = pick(targets, i);
    const position = pick(positions, i);

    if (target == null || position == null) {
      return null;
    }

    const place = takeLaneLabel(target);

    return {
      place,
      destination: `${place}[${position}]`,
      arrangement: { position, target },
    };
  });
}

/**
 * The lanes a source's arrangement copies land on. No track means the source's
 * own, and the deprecated takeLane folds on the way the copier folds it.
 * @param clip - The source clip
 * @param targets - The resolved destinations, null where unusable
 * @param takeLane - The deprecated takeLane param
 * @returns One lane per destination, null where none lands
 */
function arrangementTargets(
  clip: LiveAPI,
  targets: ClipDestinations["arrangementTargets"],
  takeLane: number | string | undefined,
): (ArrangementTrack | null)[] {
  const ownTrack = clip.trackIndex;
  const named =
    targets.length === 0 ? [{ trackIndex: null, takeLane: null }] : targets;

  return aliasTakeLane(
    named.map((target) => {
      const trackIndex = target?.trackIndex ?? ownTrack;

      return target == null || trackIndex == null
        ? null
        : { trackIndex, takeLane: target.takeLane };
    }),
    takeLane,
  );
}

/**
 * The entry for one copy: a lone entry covers every copy.
 * @param list - One entry, or one per copy
 * @param index - The copy
 * @returns Its entry
 */
function pick<T>(list: T[], index: number): T | undefined {
  return list.length === 1 ? list[0] : list[index];
}

/**
 * The stretch of lane one clip copy covers, or null for a slot.
 * @param clip - The source clip
 * @param copy - The copy
 * @param length - This copy's arrangementLength, if the call gave one
 * @returns Its footprint
 */
function copySpans(
  clip: LiveAPI,
  copy: PlannedCopy,
  length: string | undefined,
): Span[] | null {
  if (copy.arrangement == null) {
    return null;
  }

  const meter = songMeter();
  const start = arrangementPositionToBeats(
    copy.arrangement.position,
    meter.numerator,
    meter.denominator,
  );

  return [
    {
      start,
      end: start + copyBeats(clip, copy.arrangement.target, length, meter),
    },
  ];
}

/**
 * How long one arrangement copy is. A re-created copy — onto a take lane, or
 * off one — ignores arrangementLength and takes the source's own length.
 * @param clip - The source clip
 * @param target - Where the copy lands
 * @param length - This copy's arrangementLength, if the call gave one
 * @param meter - The song meter a bar count is read in
 * @returns Its length in beats
 */
function copyBeats(
  clip: LiveAPI,
  target: ArrangementTrack,
  length: string | undefined,
  meter: SongMeter,
): number {
  // A session clip lands at its own clip length, an arrangement clip at its
  // extent on the lane.
  const own = clip.sceneIndex != null ? clipLengthBeats(clip) : spanBeats(clip);

  if (length == null || target.takeLane != null || isTakeLaneClip(clip)) {
    return own;
  }

  const beats = parseArrangementLength(
    length,
    meter.numerator,
    meter.denominator,
  );

  // Shorter than the clip's own length, the copy is cut to size off to the
  // side first. Otherwise Live's duplicate lands the whole clip, clearing its
  // full extent, before it is lengthened or trimmed.
  return beats < clipLengthBeats(clip) ? beats : Math.max(beats, own);
}

/**
 * An arrangement clip's extent on its lane, in beats.
 * @param clip - The clip
 * @returns Its length on the lane
 */
function spanBeats(clip: LiveAPI): number {
  const { start, end } = clipSpan(clip);

  return end - start;
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

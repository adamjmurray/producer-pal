// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The copies a track or scene call makes: `count` of each source, or one scene
// copy per arrangement position.

import { takeLaneLabel } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type Cover } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { arrangementPositionPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { parseArrangementLength } from "../../clip/arrangement-length.ts";
import { resolveArrangementPositions } from "../../duplicate-destinations.ts";
import { type ScenePass } from "../../sources/scene-clips.ts";
import { type SourceShare } from "../../sources/source-plan.ts";
import { type CopyBody, type CopyDraft } from "../duplicate-call-types.ts";
import { type SongMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";

/**
 * One draft per copy of each track or session scene source.
 * @param kind - "track" or "scene"
 * @param sources - The sources, in call order
 * @param count - How many copies of each
 * @returns The drafts, a source's copies together
 */
export function countedDrafts(
  kind: "track" | "scene",
  sources: SourceShare[],
  count: number,
): CopyDraft[] {
  return sources.flatMap((source) =>
    Array.from({ length: count }, (): CopyDraft => {
      const body: CopyBody = { kind, sourceId: source.id };

      return source.skip == null
        ? { named: source.named, make: () => ({ body }) }
        : { named: source.named, skip: source.skip };
    }),
  );
}

/** What the scene copies are told about the call. */
export interface SceneDraftParams {
  /** The song's time signature, read once for the call */
  meter: SongMeter;
  /** A source scene as read, once for the call */
  sceneOf: (id: string) => ScenePass;
  /** The call copies no clips, so nothing is written over */
  withoutClips: boolean;
}

/**
 * One draft per arrangement position of each scene source. A lone position
 * lays `count` copies end to end from it, each as long as its own length or the
 * scene's own.
 * @param sources - The scenes, in call order
 * @param count - How many copies of each, for a lone position
 * @param params - What the scene copies are told about the call
 * @returns The drafts, a source's copies together
 */
export function sceneArrangementDrafts(
  sources: SourceShare[],
  count: number,
  params: SceneDraftParams,
): CopyDraft[] {
  const { numerator, denominator } = params.meter;
  const plans = sources.map((source) => {
    const positions = resolveArrangementPositions(
      source.arrangementStart,
      numerator,
      denominator,
    );
    const endToEnd = positions.length === 1 && count > 1;

    return {
      source,
      positions,
      endToEnd,
      copies: endToEnd ? count : positions.length,
    };
  });
  // A copy can only go over another of the call when there is another, and
  // one that copies no clips goes over nothing.
  const covering =
    !params.withoutClips &&
    plans.reduce((total, { copies }) => total + copies, 0) > 1;

  return plans.flatMap(({ source, positions, endToEnd, copies }) => {
    // Where the next end-to-end copy starts; each draft moves it along.
    let next = positions[0] as number;

    return Array.from({ length: copies }, (_, i): CopyDraft => {
      // Nothing is known of a scene that isn't there, so its end-to-end copies
      // all say where the first would have gone.
      if (source.skip != null) {
        return {
          named: positionNamed(
            endToEnd ? (positions[0] as number) : (positions[i] as number),
            numerator,
            denominator,
          ),
          skip: source.skip,
        };
      }

      return {
        named: positionNamed(
          positions[i] ?? (positions[0] as number),
          numerator,
          denominator,
        ),
        make: (label) => {
          const at = endToEnd ? next : (positions[i] as number);
          // The length asked for this copy, or the scene's own.
          const length = (): number =>
            label.length == null
              ? params.sceneOf(source.id).length
              : parseArrangementLength(label.length, numerator, denominator);

          if (endToEnd) {
            next = at + length();
          }

          return {
            body: {
              kind: "scene-arrangement",
              sourceId: source.id,
              startBeats: at,
            },
            covers: covering
              ? () =>
                  sceneCovers(
                    params.sceneOf(source.id),
                    at,
                    length(),
                    params.meter,
                  )
              : undefined,
            named: positionNamed(at, numerator, denominator),
          };
        },
      };
    });
  });
}

// --- Helpers below main exports ---

/**
 * How a copy at a position is addressed in the result.
 * @param beats - Where it is headed, in Ableton beats
 * @param numerator - The song's time signature numerator
 * @param denominator - The song's time signature denominator
 * @returns The path a copy there would report
 */
function positionNamed(
  beats: number,
  numerator: number,
  denominator: number,
): NamedTarget {
  return {
    param: "path",
    value: `[${abletonBeatsToBarBeat(beats, numerator, denominator)}]`,
  };
}

/**
 * What a scene copy writes over: each track holding one of its clips, for the
 * length of the copy.
 * @param scene - The source scene as read
 * @param from - Where the copy starts, in Ableton beats
 * @param length - How long it is, in Ableton beats
 * @param meter - The song's time signature
 * @returns One stretch of lane per track the scene has a clip on
 */
function sceneCovers(
  scene: ScenePass,
  from: number,
  length: number,
  meter: SongMeter,
): Cover[] | undefined {
  const covers = scene.clips.map(({ trackIndex }): Cover => {
    return {
      lane: takeLaneLabel({ trackIndex, takeLane: null }),
      from,
      to: from + length,
      as: arrangementPositionPath({ kind: "track", trackIndex }, from, meter),
    };
  });

  return covers.length === 0 ? undefined : covers;
}

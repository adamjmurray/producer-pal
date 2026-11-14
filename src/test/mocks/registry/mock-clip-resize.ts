// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type RegisteredMockObject } from "./mock-registry-helpers.ts";

/** Arrangement beats per second at Live's default 120 BPM. */
export const DEFAULT_BEATS_PER_SECOND = 2;

interface LiveUnloopedSpanArgs {
  /** Where the region ends (`loop_end`), in marker units. */
  end: number;
  startMarker: number;
  /** Unwarped audio counts its markers in seconds, everything else in beats. */
  inSeconds: boolean;
  beatsPerSecond: number;
  /** Room before the next clip on the lane, in beats; growth stops there. */
  room: number;
}

/**
 * Make a registered arrangement clip answer `looping`, `loop_end` and the
 * markers the way Live does (see arrangement-clip-resize.ts): an unlooped
 * clip's span follows `loop_end`, and a looped one keeps its loop brace through
 * a toggle. Unwarped audio's markers count in seconds at 120 BPM, everything
 * else's in beats. Earlier `set` behavior is kept for every other property.
 * @param clip - A registered clip with `start_time`, `end_time`, `looping`,
 *   `loop_start`, `loop_end`, `start_marker` and `end_marker`
 * @param nextClipStart - Where the next clip on the lane starts, or a function
 *   that says so at the time; growth stops there
 */
export function resizesLikeLiveClip(
  clip: RegisteredMockObject,
  nextClipStart: number | (() => number) = Infinity,
): void {
  const p = clip.properties;
  const num = (property: string): number => Number(p[property] ?? 0);
  const before = clip.set.getMockImplementation();
  let brace = { start: num("loop_start"), end: num("loop_end") };
  let unloopedEnd = num(num("looping") > 0 ? "end_marker" : "loop_end");

  const setSpan = (end: number): void => {
    const start = num("start_time");
    const next =
      typeof nextClipStart === "function" ? nextClipStart() : nextClipStart;

    p.end_time =
      start +
      liveUnloopedSpan({
        end,
        startMarker: num("start_marker"),
        inSeconds: num("is_audio_clip") > 0 && num("warping") === 0,
        beatsPerSecond: DEFAULT_BEATS_PER_SECOND,
        room: next - start,
      });
  };

  clip.set.mockImplementation((property: string, value: unknown) => {
    const v = Number(value);
    const looping = num("looping") > 0;

    if (property === "looping") {
      if (v > 0 && !looping) {
        p.loop_start = brace.start;
        p.loop_end = brace.end;
        p.end_marker = unloopedEnd;
      } else if (v === 0 && looping) {
        brace = { start: num("loop_start"), end: num("loop_end") };
        p.loop_start = num("start_marker");
        p.loop_end = unloopedEnd;
        setSpan(unloopedEnd);
      }

      p.looping = v > 0 ? 1 : 0;
    } else if (property === "loop_end" && !looping) {
      unloopedEnd = v;
      p.loop_end = v;
      setSpan(v);
    } else if (property === "end_marker" || property === "loop_start") {
      p[property] = v;
    } else if (property === "loop_end") {
      p.loop_end = v;
    } else {
      before?.(property, value);
    }
  });
}

/**
 * The span Live gives an unlooped clip whose region ends at `end`.
 * @param args - The region and the room it has
 * @param args.end - Where the region ends, in marker units
 * @param args.startMarker - Where it starts, in marker units
 * @param args.inSeconds - Whether the markers count in seconds
 * @param args.beatsPerSecond - The rate seconds convert at
 * @param args.room - Room before the next clip, in beats
 * @returns The span in beats
 */
export function liveUnloopedSpan({
  end,
  startMarker,
  inSeconds,
  beatsPerSecond,
  room,
}: LiveUnloopedSpanArgs): number {
  return Math.min((end - startMarker) * (inSeconds ? beatsPerSecond : 1), room);
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * A stand-in arrangement clip that answers `looping`, `loop_end` and the
 * markers the way Live 12.3–12.4 does (see arrangement-clip-resize.ts), so a
 * resize can be tested against Live's behavior rather than a call list.
 */
import { vi } from "vitest";
import {
  DEFAULT_BEATS_PER_SECOND,
  liveUnloopedSpan,
} from "#src/test/mocks/registry/mock-clip-resize.ts";

export interface FakeClipState {
  looping: boolean;
  /** The loop brace, kept while unlooped and restored on re-loop. */
  loopStart: number;
  loopEnd: number;
  startMarker: number;
  endMarker: number;
  /** Live's remembered unlooped end, swapped in when looping goes off. */
  unloopedEnd: number;
  startTime: number;
  span: number;
  warping: boolean;
  /** Where the next clip on the lane starts; growth stops there. */
  nextClipStart: number;
  /** Arrangement beats per second, for unwarped audio. */
  beatsPerSecond: number;
  /** The clip's track, or null for one with none. */
  trackIndex: number | null;
}

export interface FakeClip {
  clip: LiveAPI;
  state: FakeClipState;
  set: ReturnType<typeof vi.fn>;
}

/**
 * @param overrides - State to start from; defaults to a 1-bar looping clip at 0
 * @returns The fake clip, its live state, and the `set` spy
 */
export function fakeArrangementClip(
  overrides: Partial<FakeClipState> = {},
): FakeClip {
  const state: FakeClipState = {
    looping: true,
    loopStart: 0,
    loopEnd: 4,
    startMarker: 0,
    endMarker: 4,
    unloopedEnd: 4,
    startTime: 0,
    span: 4,
    warping: true,
    nextClipStart: Infinity,
    beatsPerSecond: DEFAULT_BEATS_PER_SECOND,
    trackIndex: 0,
    ...overrides,
  };

  const unloopedSpan = (end: number): number =>
    liveUnloopedSpan({
      end,
      startMarker: state.startMarker,
      inSeconds: !state.warping,
      beatsPerSecond: state.beatsPerSecond,
      room: state.nextClipStart - state.startTime,
    });

  const read: Record<string, () => number> = {
    looping: () => (state.looping ? 1 : 0),
    loop_start: () => (state.looping ? state.loopStart : state.startMarker),
    loop_end: () => (state.looping ? state.loopEnd : state.unloopedEnd),
    start_marker: () => state.startMarker,
    end_marker: () => state.endMarker,
    start_time: () => state.startTime,
    end_time: () => state.startTime + state.span,
    warping: () => (state.warping ? 1 : 0),
  };

  const write: Record<string, (value: number) => void> = {
    looping: (value) => {
      state.looping = value > 0;

      if (state.looping) {
        state.endMarker = state.unloopedEnd;
      } else {
        state.span = unloopedSpan(state.unloopedEnd);
      }
    },
    loop_start: (value) => {
      if (state.looping) {
        crossCheck(value, state.loopEnd);
        state.loopStart = value;
      }
    },
    loop_end: (value) => {
      if (state.looping) {
        crossCheck(state.loopStart, value);
        state.loopEnd = value;
      } else {
        state.unloopedEnd = value;
        state.span = unloopedSpan(value);
      }
    },
    end_marker: (value) => {
      state.endMarker = value;
    },
  };

  const set = vi.fn((property: string, value: number) => {
    known(write, property)(value);
  });
  const clip = {
    id: "1",
    trackIndex: state.trackIndex,
    getProperty: (property: string) => known(read, property)(),
    set,
  } as unknown as LiveAPI;

  return { clip, state, set };
}

/**
 * @param table - Property handlers
 * @param property - The property asked for
 * @returns Its handler; throws for a property the fake doesn't model
 */
function known<T>(table: Record<string, T>, property: string): T {
  const handler = table[property];

  if (handler == null) {
    throw new Error(`fake clip doesn't model ${property}`);
  }

  return handler;
}

/**
 * Live refuses a loop brace whose start isn't before its end.
 * @param start - The loop start it would have
 * @param end - The loop end it would have
 */
function crossCheck(start: number, end: number): void {
  if (start >= end) {
    throw new Error(`loop start ${start} not before loop end ${end}`);
  }
}

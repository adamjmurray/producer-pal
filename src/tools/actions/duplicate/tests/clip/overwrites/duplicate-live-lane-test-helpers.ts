// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An arrangement lane that overwrites the way Live does, for the tests of what
// a copy says it overwrote. A write over [start, end) never touches a clip it
// doesn't overlap. A clip covered whole is gone. A trim keeps the clip's id,
// except a write starting exactly where a clip starts: Live deletes that clip
// and re-creates the rest under a new id. A split keeps the head's id and gives
// the tail a new one.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  createStandardMidiClipMock,
  registerClipSlot,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

/** One clip on the lane. */
export interface LaneClip {
  id: string;
  start: number;
  end: number;
}

export interface LiveLaneOptions {
  trackIndex: number;
  /** The take lane to simulate; omitted is the track's main lane. */
  laneIndex?: number;
  /** The clips on the lane to start with. */
  clips?: LaneClip[];
  /** How long a clip made by `duplicate_clip_to_arrangement` is. */
  copyBeats?: number;
  /**
   * Make each copy as long as its source is right now, when the source is on
   * the lane, so a source a write trimmed is copied trimmed.
   */
  copiesSourceLength?: boolean;
}

/** A simulated lane, and what to do to it. */
export interface LiveLane {
  /** The track, which also answers `duplicate_clip_to_arrangement`. */
  track: RegisteredMockObject;
  /** The clips now on the lane, in Live's order. */
  clips: () => LaneClip[];
  /**
   * What Live does for a write over a range.
   * @param start - Where the write begins, in beats
   * @param end - Where it ends
   * @param id - The id of the clip made; omitted makes one up
   * @returns The id of the clip made
   */
  write: (start: number, end: number, id?: string) => string;
  /**
   * Lengthen a clip the way update-clip does: what it grows over is cleared.
   * @param id - The clip to grow
   * @param end - Where it should end
   */
  grow: (id: string, end: number) => void;
  /** The next write clears its range and makes no clip. */
  declineNextWrite: () => void;
  /** Every clip's mock, by id, to count how often it was read. */
  mocks: Map<string, RegisteredMockObject>;
}

/**
 * What is left of a lane once a write has cleared a range.
 * @param lane - The clips on the lane
 * @param start - Where the range begins, in beats
 * @param end - Where it ends
 * @param nextId - Makes the id for a clip Live re-creates
 * @returns The clips that remain
 */
function clearRange(
  lane: LaneClip[],
  start: number,
  end: number,
  nextId: (kind: string) => string,
): LaneClip[] {
  const kept: LaneClip[] = [];

  for (const clip of lane) {
    if (clip.end <= start || clip.start >= end) {
      kept.push(clip);
    } else if (clip.start < start && clip.end > end) {
      kept.push(
        { ...clip, end: start },
        { id: nextId("tail"), start: end, end: clip.end },
      );
    } else if (clip.start < start) {
      kept.push({ ...clip, end: start });
    } else if (clip.end > end && clip.start > start) {
      kept.push({ ...clip, start: end });
    } else if (clip.end > end) {
      kept.push({ id: nextId("rest"), start: end, end: clip.end });
    }

    if (!kept.some((each) => each.id === clip.id)) {
      // A cleared clip keeps its id and loses its path, as in Live.
      registerMockObject(clip.id, { path: "" });
    }
  }

  return kept;
}

/**
 * Register a track (or one of its take lanes) holding clips that overwrite the
 * way Live's do.
 * @param options - Where the lane is, and what is on it
 * @returns The lane
 */
export function registerLiveLane(options: LiveLaneOptions): LiveLane {
  const { trackIndex, laneIndex, copyBeats = 8, copiesSourceLength } = options;
  const owner =
    laneIndex == null
      ? livePath.track(trackIndex)
      : livePath.track(trackIndex).takeLane(laneIndex);
  const mocks = new Map<string, RegisteredMockObject>();
  let lane: LaneClip[] = [...(options.clips ?? [])];
  let made = 0;
  let declining = false;

  const ownerMock = registerMockObject(
    laneIndex == null ? `live_set/tracks/${trackIndex}` : `lane-${trackIndex}`,
    {
      path: owner,
      type: laneIndex == null ? "Track" : "TakeLane",
      properties: { arrangement_clips: [] },
    },
  );
  const track =
    laneIndex == null
      ? ownerMock
      : registerMockObject(`live_set/tracks/${trackIndex}`, {
          path: livePath.track(trackIndex),
          properties: {
            has_midi_input: 1,
            is_foldable: 0,
            take_lanes: children(`lane-${trackIndex}`),
            arrangement_clips: children(),
          },
        });

  // Live lists clips in order, and a clip's path says which place it holds.
  const publish = (): void => {
    lane = lane.toSorted((a, b) => a.start - b.start);

    for (const [index, clip] of lane.entries()) {
      mocks.set(
        clip.id,
        registerMockObject(clip.id, {
          path: owner.arrangementClip(index),
          type: "Clip",
          properties: {
            is_arrangement_clip: 1,
            is_midi_clip: 1,
            start_time: clip.start,
            end_time: clip.end,
            length: clip.end - clip.start,
          },
        }),
      );
    }

    ownerMock.properties.arrangement_clips = children(
      ...lane.map((clip) => clip.id),
    );
  };

  const nextId = (kind: string): string => `${kind}-${trackIndex}-${made++}`;

  const clear = (start: number, end: number): void => {
    lane = clearRange(lane, start, end, nextId);
  };

  const write = (start: number, end: number, id?: string): string => {
    clear(start, end);

    if (declining) {
      declining = false;
      publish();

      return "0";
    }

    const clipId = id ?? nextId("copy");

    lane.push({ id: clipId, start, end });
    publish();

    return clipId;
  };

  const copyLength = (source: unknown): number => {
    const clip = lane.find((each) => `id ${each.id}` === source);

    return copiesSourceLength && clip != null
      ? clip.end - clip.start
      : copyBeats;
  };

  track.methods.duplicate_clip_to_arrangement = (
    source: unknown,
    beats: unknown,
  ) => {
    const length = copyLength(source);

    return ["id", write(Number(beats), Number(beats) + length)];
  };

  ownerMock.methods.delete_clip = (source: unknown) => {
    const id = lane.find((each) => `id ${each.id}` === source)?.id;

    if (id != null) {
      lane = lane.filter((each) => each.id !== id);
      deleteMockObject(id);
      publish();
    }

    return ["id", 0];
  };

  ownerMock.methods.create_midi_clip = (start: unknown, length: unknown) => [
    "id",
    write(Number(start), Number(start) + Number(length)),
  ];

  publish();

  return {
    track,
    clips: () => lane,
    write,
    grow: (id, end) => {
      const clip = lane.find((each) => each.id === id) as LaneClip;
      const grown = { ...clip };

      lane = lane.filter((each) => each !== clip);
      clear(clip.end, end);
      lane.push({ ...grown, end });
      publish();
    },
    declineNextWrite: () => {
      declining = true;
    },
    mocks,
  };
}

/** A session clip as long as every copy Live makes on the simulated lanes. */
export function registerEightBeatSource(): void {
  setupArrangementSceneMocks(2);
  registerMockObject("source", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: {
      is_midi_clip: 1,
      length: 8,
      looping: 0,
      loop_start: 0,
      loop_end: 8,
    },
  });
}

/** A scene with one clip on each of its first two tracks. */
export function registerTwoClipScene(): void {
  setupArrangementSceneMocks(2);
  registerClipSlot(0, 0, true, createStandardMidiClipMock());
  registerClipSlot(1, 0, true, createStandardMidiClipMock());
}

/**
 * Copy scene1 to arrangement positions.
 * @param toPath - The destinations
 * @returns The duplicate result
 */
export function copySceneTo(toPath: string): ReturnType<typeof duplicate> {
  return duplicate({ type: "scene", id: "scene1", toPath });
}

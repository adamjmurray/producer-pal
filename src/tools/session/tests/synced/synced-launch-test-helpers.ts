// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** A launch quantization no grid picks, standing for "whatever the clip had" */
export const OWN_QUANTIZATION = 7;

/** A session clip that is playing and (by default) looping */
export interface LoopSpec {
  track: number;
  scene?: number;
  /** Loop length in beats, from a loop start of 0 */
  length: number;
  /** Where the playhead is inside the loop, as of song time `songTime` */
  position: number;
  looping?: boolean;
  /** The playhead as Live reports it, whatever the loop (e.g. past its end) */
  rawPosition?: number;
}

/** A clip slot about to be fired */
export interface FireSpec {
  track: number;
  scene: number;
  /** False for a group slot or an empty one (default true) */
  clip?: boolean;
  /** The slot is empty until `create_clip` is called on it, as a clip to create */
  creating?: boolean;
  /** A group track's slot, which controls the slots of its members */
  group?: boolean;
  /** The slot throws when fired */
  throws?: boolean;
}

export interface WorldOptions {
  tempo?: number;
  numerator?: number;
  denominator?: number;
  /** Where the transport is, in beats */
  songTime?: number;
  playing?: boolean;
  trackCount?: number;
  loops?: LoopSpec[];
  fires?: FireSpec[];
}

export interface SyncedWorld {
  liveSet: RegisteredMockObject;
  /** The slots to fire, by "t1/s0" */
  slots: Map<string, RegisteredMockObject>;
  /** What was written and fired, in order: "quant 4", "fire t1/s0" */
  log: string[];
  /** Moves song time on, as a wait would */
  advance: (beats: number) => void;
  songTime: () => number;
  /** Runs after each wait tick, before the poll that follows it */
  onTick: (hook: () => void) => void;
}

/** Song time, shared by the mocks that read it */
interface Clock {
  start: number;
  songTime: number;
}

/**
 * A Live Set with some loops playing, and slots to fire. The playheads move
 * with song time, and `Task.schedule` moves song time instead of waiting, so a
 * synced launch's wait runs through at once.
 *
 * Installs a global `Task`: call `vi.unstubAllGlobals()` after the test. Each
 * wait tick also moves `Date.now()` on, at the Live Set's current tempo.
 * @param options - What the Set holds
 * @returns Handles on it
 */
export function setupSyncedWorld(options: WorldOptions = {}): SyncedWorld {
  const { tempo = 120, trackCount = 4, loops = [], fires = [] } = options;
  const start = options.songTime ?? 0;
  const clock: Clock = { start, songTime: start };
  const log: string[] = [];
  const slots = new Map<string, RegisteredMockObject>();
  let tick: () => void = () => {};

  mockNonExistentObjects();

  // The clock stands still until a wait moves it, so a deadline is exact.
  const realNow = Date.now();
  let skewMs = 0;

  vi.spyOn(Date, "now").mockImplementation(() => realNow + skewMs);

  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      is_playing: options.playing === false ? 0 : 1,
      tempo,
      signature_numerator: options.numerator ?? 4,
      signature_denominator: options.denominator ?? 4,
      scenes: children("scene0"),
      tracks: children(
        ...Array.from({ length: trackCount }, (_, i) => `t${i}`),
      ),
      get current_song_time() {
        return clock.songTime;
      },
    },
  });

  registerTracks(trackCount, loops);

  for (const loop of loops) {
    registerLoop(loop, clock);
  }

  for (const spec of fires) {
    registerFiredSlot(spec, log, slots);
  }

  const advance = (beats: number): void => {
    clock.songTime += beats;
  };

  vi.stubGlobal(
    "Task",
    class {
      constructor(private readonly callback: () => void) {}

      schedule(ms: number): void {
        skewMs += ms;
        advance((ms / 60_000) * (liveSet.properties.tempo as number));
        tick();
        this.callback();
      }
    },
  );

  return {
    liveSet,
    slots,
    log,
    advance,
    songTime: () => clock.songTime,
    onTick: (hook) => {
      tick = hook;
    },
  };
}

/**
 * @param trackCount - How many tracks the Set has
 * @param loops - The playing loops, which say what each track plays
 */
function registerTracks(trackCount: number, loops: LoopSpec[]): void {
  for (let index = 0; index < trackCount; index++) {
    const loop = loops.find((candidate) => candidate.track === index);

    registerMockObject(`t${index}`, {
      path: livePath.track(index),
      type: "Track",
      properties: { playing_slot_index: loop == null ? -1 : (loop.scene ?? 0) },
    });
  }
}

/**
 * @param loop - A playing clip
 * @param clock - Song time, which moves its playhead
 */
function registerLoop(loop: LoopSpec, clock: Clock): void {
  registerMockObject(`loop${loop.track}`, {
    path: livePath
      .track(loop.track)
      .clipSlot(loop.scene ?? 0)
      .clip(),
    properties: {
      looping: loop.looping === false ? 0 : 1,
      loop_start: 0,
      loop_end: loop.length,
      get playing_position() {
        return (
          loop.rawPosition ??
          (loop.position + clock.songTime - clock.start) % loop.length
        );
      },
    },
  });
}

/**
 * @param spec - A slot about to be fired
 * @param log - Where the fire and the quantization writes are noted
 * @param slots - Where the slot is kept, by name
 */
function registerFiredSlot(
  spec: FireSpec,
  log: string[],
  slots: Map<string, RegisteredMockObject>,
): void {
  const path = livePath.track(spec.track).clipSlot(spec.scene);
  const name = `t${spec.track}/s${spec.scene}`;
  const slot = registerMockObject(path, {
    path,
    properties: {
      has_clip: spec.clip === false || spec.creating === true ? 0 : 1,
      controls_other_clips: spec.group === true ? 1 : 0,
    },
    methods: {
      create_clip: () => {
        slot.properties.has_clip = 1;

        return null;
      },
      fire: () => {
        log.push(`fire ${name}`);

        if (spec.throws === true) {
          throw new Error("fire failed");
        }
      },
    },
  });

  slots.set(name, slot);

  if (spec.clip !== false) {
    const clip = registerMockObject(`clip-${spec.track}-${spec.scene}`, {
      path: path.clip(),
      properties: { launch_quantization: OWN_QUANTIZATION, length: 4 },
      methods: createNoteTrackingMethods(),
    });

    clip.set.mockImplementation((property: string, value: unknown) => {
      if (property === "launch_quantization") {
        log.push(`quant ${String(value)}`);
      }
    });
  }
}

/**
 * Stop the transport after some wait ticks.
 * @param world - The world
 * @param after - How many ticks to let pass
 */
export function stopTransportAfter(world: SyncedWorld, after: number): void {
  let ticks = 0;

  world.onTick(() => {
    if (++ticks === after) {
      world.liveSet.properties.is_playing = 0;
    }
  });
}

/**
 * Drop the tempo to 30 BPM after some wait ticks, which stretches the wait.
 * @param world - The world
 * @param after - How many ticks to let pass
 */
export function slowDownAfter(world: SyncedWorld, after: number): void {
  let ticks = 0;

  world.onTick(() => {
    if (++ticks === after) {
      world.liveSet.properties.tempo = 30;
    }
  });
}

/**
 * A loop that came round at song time 2, so it restarts at 10: a line of the
 * 2 beat grid only. A fire has to wait until the loop start is under 2 beats
 * away, which at 120 BPM is 3 s.
 */
export const LATE_LOOP: WorldOptions = {
  songTime: 2,
  loops: [{ track: 0, length: 8, position: 0 }],
};

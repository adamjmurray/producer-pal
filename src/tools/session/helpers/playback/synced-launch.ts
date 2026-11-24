// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { type MaybePromise } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";

/** Beats two positions may differ by and still count as the same one */
const EPSILON = 0.02;
/** A loop start nearer than this is aimed past: the fire might land after it */
const GUARD_SECONDS = 0.15;
/**
 * A later clip of a call fires a few ms after the first, which cleared the
 * guard. Nearer than this to the loop start, its fire might land after it.
 */
const LATER_CLIP_MARGIN_SECONDS = 0.03;
/** Left of the request's time once the wait is over */
const DEADLINE_MARGIN_MS = 5000;
/** The longest wait when the request carries no deadline */
const DEFAULT_MAX_WAIT_MS = 30_000;
const MS_PER_MINUTE = 60_000;
const PLAIN_HINT = "use play-session-clips to fire without sync";

/** A launch quantization: its length, and Clip.launch_quantization's value */
interface Grid {
  beats: number;
  value: number;
}

interface PlayingLoop {
  trackIndex: number;
  path: string;
  /** Loop length in beats */
  length: number;
  /** Song time of its next loop start, in beats */
  restartsAt: number;
}

/** Where clips fired in sync are to start. */
export interface SyncedLaunch {
  /** Song time of a loop start to land on. Absent: nothing to sync to */
  startBeat?: number;
  /** The loop's length: every `loopBeats` after `startBeat` is a loop start too */
  loopBeats?: number;
  /** The loop synced to, "t0/s1" */
  reference?: string;
  /** Why the clips fire without sync, when something is looping */
  unsynced?: string;
  /** Clock time a wait for the loop start gives up at */
  waitEndsAt?: number;
  /**
   * Fixed by the first clip fired, after any wait, so every clip of the call
   * aims at the same loop start. Null: there is nothing to aim at.
   */
  aim?: Aim | null;
}

/** The loop start a call's clips all aim at */
interface Aim {
  startBeat: number;
  /** The grid that lands a fire on it. Absent: fire without sync */
  grid?: Grid;
  /** Seconds to it, as of the first fire */
  startsIn: number;
}

/** When to fire, as of now. */
interface Timing {
  /** The loop start being aimed at */
  startBeat: number;
  /** Beats until it */
  remaining: number;
  /** The grid a fire right now lands on it with, when there is one */
  grid?: Grid;
  /** Milliseconds until there is one */
  waitMs: number;
  tempo: number;
}

/**
 * Work out where clips must start to come in with the session loops already
 * playing: the next start of the longest one. Reads Live and writes nothing.
 *
 * A launch lands on Live's quantization grid, which counts from the top of the
 * song and not from a playing clip. So the clips are fired with a quantization
 * of their own, one whose grid has a line on the loop start and none before it.
 * @param liveSet - The live_set object
 * @param targetTracks - Indices of the tracks about to be fired
 * @param deadline - When the request must finish, if it says
 * @returns Where to start, or why there is no sync
 * @throws Error when the loops share no loop start, or it is too far off to wait for
 */
export function syncedLaunch(
  liveSet: LiveAPI,
  targetTracks: number[],
  deadline?: number | null,
): SyncedLaunch {
  if (!((liveSet.getProperty("is_playing") as number) > 0)) {
    return {};
  }

  const loops = playingLoops(liveSet);
  const others = loops.filter(
    (loop) => !targetTracks.includes(loop.trackIndex),
  );
  // A track being fired drops the loop it plays, so it only counts when no
  // other track is looping.
  const references = others.length > 0 ? others : loops;
  const [first] = references;

  if (first == null) {
    return {};
  }

  const longest = references.reduce(
    (best, loop) => (loop.length > best.length ? loop : best),
    first,
  );
  // Every loop must start over at each start of the longest one, so its length
  // has to divide the longest as well.
  const stray = references.find(
    (loop) =>
      isOffGrid(longest.restartsAt - loop.restartsAt, loop.length) ||
      isOffGrid(longest.length, loop.length),
  );

  if (stray != null) {
    throw new Error(
      `${longest.path} and ${stray.path} loop out of step, so there is no ` +
        `one loop start to sync to; ${PLAIN_HINT}`,
    );
  }

  const launch = {
    startBeat: longest.restartsAt,
    loopBeats: longest.length,
    reference: longest.path,
  };
  const timing = launchTiming(liveSet, launch);

  if (timing == null) {
    return {
      unsynced: `${longest.path} doesn't loop on Live's launch grid, so nothing can start exactly with it`,
    };
  }

  const maxWaitMs =
    deadline == null
      ? DEFAULT_MAX_WAIT_MS
      : deadline - Date.now() - DEADLINE_MARGIN_MS;

  // A launch that needs no wait goes ahead however little time is left.
  if (timing.waitMs > 0 && timing.waitMs > maxWaitMs) {
    throw new Error(
      `${longest.path} next loops in ${seconds(timing.remaining, timing.tempo)}s, ` +
        `too long for this call to wait; ${PLAIN_HINT}`,
    );
  }

  return { ...launch, waitEndsAt: Date.now() + Math.max(0, maxWaitMs) };
}

/**
 * Wait until a fire would land on the loop start. Most launches need no wait,
 * and then this stays sync.
 * @param liveSet - The live_set object
 * @param launch - Where the clips are to start
 * @returns Nothing, as a promise only when it had to wait
 */
export function awaitLaunchWindow(
  liveSet: LiveAPI,
  launch: SyncedLaunch,
): MaybePromise<void> {
  const timing = launchTiming(liveSet, launch);

  if (timing == null || timing.waitMs <= 0) {
    return;
  }

  const pollingInterval = 20;
  const waitEndsAt = launch.waitEndsAt ?? Date.now() + DEFAULT_MAX_WAIT_MS;

  // A stopped transport ends the wait: nothing is left to sync to. So does
  // running out of time, which a tempo drop mid-wait can cause.
  return waitUntil(
    () =>
      !((liveSet.getProperty("is_playing") as number) > 0) ||
      !((launchTiming(liveSet, launch)?.waitMs ?? 0) > 0) ||
      Date.now() >= waitEndsAt,
    {
      pollingInterval,
      maxRetries: Math.ceil((waitEndsAt - Date.now()) / pollingInterval) + 10,
    },
  ).then(() => {});
}

/**
 * Fire a clip slot so its clip starts on the loop start. The first slot fixes
 * the loop start and its grid for the call: later slots aim at the same start
 * while it is still safely ahead, and fire without sync once it isn't. The
 * clip's own launch quantization is set for the fire and put back straight
 * after: Live has already scheduled the launch by then.
 * @param liveSet - The live_set object
 * @param slot - The clip slot
 * @param launch - Where the clip is to start; the first fire records its aim here
 * @returns Seconds until the clip starts, or null when it fired without sync
 */
export function fireSynced(
  liveSet: LiveAPI,
  slot: LiveAPI,
  launch: SyncedLaunch,
): number | null {
  const clip = slot.child("clip");

  if (!clip.exists()) {
    slot.call("fire");

    return null;
  }

  if (launch.aim === undefined) {
    launch.aim = chooseAim(liveSet, launch);
  }

  const { aim } = launch;

  if (aim?.grid == null || !stillAhead(liveSet, aim.startBeat, aim.grid)) {
    slot.call("fire");

    return null;
  }

  const own = clip.getProperty("launch_quantization") as number;

  clip.set("launch_quantization", aim.grid.value);

  try {
    slot.call("fire");
  } finally {
    clip.set("launch_quantization", own);
  }

  return aim.startsIn;
}

// --- Helpers below main exports ---

/**
 * The session clips that are playing and looping, one per track at most.
 * @param liveSet - The live_set object
 * @returns Each loop, with when it next starts over
 */
function playingLoops(liveSet: LiveAPI): PlayingLoop[] {
  const now = liveSet.getProperty("current_song_time") as number;
  const trackCount = liveSet.getChildIds("tracks").length;
  const loops: PlayingLoop[] = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const track = LiveAPI.from(livePath.track(trackIndex));
    const sceneIndex = track.getProperty("playing_slot_index") as number;

    if (!(sceneIndex >= 0)) {
      continue;
    }

    const clip = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    );

    if (!clip.exists() || !clip.getProperty("looping")) {
      continue;
    }

    const loopEnd = clip.getProperty("loop_end") as number;
    const length = loopEnd - (clip.getProperty("loop_start") as number);
    const position = clip.getProperty("playing_position") as number;

    // A playhead past the loop's end runs on to the clip's end: not looping.
    if (length > 0 && position <= loopEnd) {
      loops.push({
        trackIndex,
        path: `t${trackIndex}/s${sceneIndex}`,
        length,
        restartsAt: now + (loopEnd - position),
      });
    }
  }

  return loops;
}

/**
 * Whether the call's loop start is still safely ahead of a fire. Not when the
 * transport has stopped or the start is too near to hit, nor when song time
 * jumped back (a loop wrap or a locate): a line of the grid before it would
 * then be the one the launch latches to.
 * @param liveSet - The live_set object
 * @param startBeat - The call's loop start
 * @param grid - The grid the clips are fired with
 * @returns True when a fire now lands on the loop start
 */
function stillAhead(liveSet: LiveAPI, startBeat: number, grid: Grid): boolean {
  if (!((liveSet.getProperty("is_playing") as number) > 0)) {
    return false;
  }

  const remaining =
    startBeat - (liveSet.getProperty("current_song_time") as number);
  const margin =
    ((liveSet.getProperty("tempo") as number) / 60) * LATER_CLIP_MARGIN_SECONDS;

  return remaining >= margin && remaining < grid.beats;
}

/**
 * @param liveSet - The live_set object
 * @param launch - Where the clips are to start
 * @returns The loop start to aim at as of now, or null when there is none
 */
function chooseAim(liveSet: LiveAPI, launch: SyncedLaunch): Aim | null {
  const timing = launchTiming(liveSet, launch);

  return timing == null
    ? null
    : {
        startBeat: timing.startBeat,
        grid: timing.grid,
        startsIn: seconds(timing.remaining, timing.tempo),
      };
}

/**
 * When to fire for the next loop start that is still far enough off to hit.
 * @param liveSet - The live_set object
 * @param launch - Where the clips are to start
 * @returns The timing, or null when no grid has a line on the loop start
 */
function launchTiming(liveSet: LiveAPI, launch: SyncedLaunch): Timing | null {
  if (launch.startBeat == null || launch.loopBeats == null) {
    return null;
  }

  const now = liveSet.getProperty("current_song_time") as number;
  const tempo = liveSet.getProperty("tempo") as number;
  const guard = (tempo / 60) * GUARD_SECONDS;
  const behind = now + guard - launch.startBeat;
  const startBeat =
    launch.startBeat +
    Math.max(0, Math.ceil(behind / launch.loopBeats)) * launch.loopBeats;
  const remaining = startBeat - now;
  // Largest first. A grid no longer than the guard never gets its turn: the
  // loop start is aimed past before the grid's last line is.
  const aligned = launchGrids(liveSet).filter(
    (grid) => grid.beats > guard && !isOffGrid(startBeat, grid.beats),
  );
  const [largest] = aligned;

  if (largest == null) {
    return null;
  }

  // The smallest grid with no line before the loop start
  const grid = aligned.findLast((candidate) => candidate.beats > remaining);
  const waitBeats = remaining - largest.beats;

  return {
    startBeat,
    remaining,
    grid,
    waitMs: grid == null ? (waitBeats * MS_PER_MINUTE) / tempo : 0,
    tempo,
  };
}

/**
 * The launch quantizations a clip can be given, largest first. Triplets are
 * left out, and so is a note value that doesn't divide the bar: its grid could
 * count from the bar or from the top of the song, and only then do they differ.
 * @param liveSet - The live_set object
 * @returns Each grid's length in beats and its Clip.launch_quantization value
 */
function launchGrids(liveSet: LiveAPI): Grid[] {
  const bar =
    ((liveSet.getProperty("signature_numerator") as number) * 4) /
    (liveSet.getProperty("signature_denominator") as number);
  const bars: Grid[] = [
    { beats: bar * 8, value: 2 },
    { beats: bar * 4, value: 3 },
    { beats: bar * 2, value: 4 },
    { beats: bar, value: 5 },
  ];
  const noteValues: Grid[] = [
    { beats: 2, value: 6 },
    { beats: 1, value: 8 },
    { beats: 0.5, value: 10 },
    { beats: 0.25, value: 12 },
    { beats: 0.125, value: 14 },
  ];

  return [
    ...bars,
    ...noteValues.filter(
      (grid) => grid.beats < bar && !isOffGrid(bar, grid.beats),
    ),
  ];
}

/**
 * @param beats - A position, in beats
 * @param grid - The grid's spacing, in beats
 * @returns True when the position is not on a grid line
 */
function isOffGrid(beats: number, grid: number): boolean {
  const past = ((beats % grid) + grid) % grid;

  return Math.min(past, grid - past) > EPSILON;
}

/**
 * @param beats - A length, in beats
 * @param tempo - The tempo, in BPM
 * @returns The length in seconds, to one decimal
 */
function seconds(beats: number, tempo: number): number {
  return Math.round((beats * 600) / tempo) / 10;
}

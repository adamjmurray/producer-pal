// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * What the synced-launch suites share: looping clips to fire, and a read of two
 * clips' playheads taken in one call, so their positions can be compared.
 * Needs `liveApiEnabled` (see e2e/mcp/README.md).
 */
import {
  type McpTestContext,
  parseToolResult,
  sleep,
} from "../../mcp-test-helpers.ts";

/** A session clip slot */
export interface Slot {
  track: number;
  scene: number;
}

/** Playheads read in one call */
export interface Snapshot {
  /** Song time, in beats */
  songTime: number;
  /** Each clip's `playing_position`, in the order asked */
  positions: number[];
}

/** live_set.clip_trigger_quantization: 4 is 1 bar, 0 is none */
export const ONE_BAR = 4;
export const NO_QUANTIZATION = 0;

/**
 * The Live path of a slot's clip.
 * @param slot - The slot
 * @returns The path, for a `goto`
 */
export function clipPath({ track, scene }: Slot): string {
  return `live_set tracks ${track} clip_slots ${scene} clip`;
}

const PLAYBACK = "ppal-playback";
const GET = "get-property";
const GOTO = "goto";

/**
 * @param slot - A slot
 * @returns Its path as the tools take it
 */
function slotPath({ track, scene }: Slot): string {
  return `t${track}/s${scene}`;
}

/**
 * The calls, bound to a test context.
 * @param ctx - The MCP test context the suite set up
 * @returns The calls
 */
export function syncedLaunchCalls(ctx: McpTestContext): {
  liveApi: (operations: unknown[]) => Promise<unknown[]>;
  makeLoop: (slot: Slot, length: string) => Promise<void>;
  startLoop: (slot: Slot) => Promise<void>;
  playbackSynced: (slot: Slot) => Promise<unknown>;
  snapshot: (slots: Slot[]) => Promise<Snapshot>;
  clipValue: (slot: Slot, property: string) => Promise<number>;
  readGlobalQuantization: () => Promise<number>;
  setGlobalQuantization: (value: number) => Promise<void>;
  waitFor: (what: () => Promise<boolean>, timeoutMs?: number) => Promise<void>;
  isClipPlaying: (slot: Slot) => Promise<boolean>;
  stopAll: () => Promise<void>;
} {
  const liveApi = async (operations: unknown[]): Promise<unknown[]> =>
    parseToolResult<{ results: unknown[] }>(
      await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: { path: "live_set", operations },
      }),
    ).results;

  const makeLoop = async (slot: Slot, length: string): Promise<void> => {
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: slotPath(slot),
        notes: "C3 1|1",
        length,
        looping: true,
      },
    });
  };

  // Park the playhead at the top first: a loop fired on a stopped transport
  // then starts at song time 0, which is on every launch grid.
  const startLoop = async (slot: Slot): Promise<void> => {
    await ctx.client!.callTool({
      name: PLAYBACK,
      arguments: { action: "update-arrangement", startTime: "1|1" },
    });
    await ctx.client!.callTool({
      name: PLAYBACK,
      arguments: { action: "play-session-clips", path: slotPath(slot) },
    });
  };

  const playbackSynced = async (slot: Slot): Promise<unknown> =>
    await ctx.client!.callTool({
      name: PLAYBACK,
      arguments: { action: "play-session-clips-synced", path: slotPath(slot) },
    });

  const snapshot = async (slots: Slot[]): Promise<Snapshot> => {
    const results = await liveApi([
      { type: GET, property: "current_song_time" },
      ...slots.flatMap((slot) => [
        { type: GOTO, value: clipPath(slot) },
        { type: GET, property: "playing_position" },
      ]),
    ]);

    return {
      songTime: results[0] as number,
      positions: slots.map((_, i) => results[2 + i * 2] as number),
    };
  };

  const clipValue = async (slot: Slot, property: string): Promise<number> => {
    const results = await liveApi([
      { type: GOTO, value: clipPath(slot) },
      { type: GET, property },
    ]);

    return results[1] as number;
  };

  const readGlobalQuantization = async (): Promise<number> =>
    (
      await liveApi([{ type: GET, property: "clip_trigger_quantization" }])
    )[0] as number;

  const setGlobalQuantization = async (value: number): Promise<void> => {
    await liveApi([
      { type: "set-property", property: "clip_trigger_quantization", value },
    ]);
  };

  const isClipPlaying = async (slot: Slot): Promise<boolean> =>
    (await clipValue(slot, "is_playing")) === 1;

  const waitFor = async (
    what: () => Promise<boolean>,
    timeoutMs = 10_000,
  ): Promise<void> => {
    const until = Date.now() + timeoutMs;

    while (!(await what())) {
      if (Date.now() > until) {
        throw new Error("timed out waiting for Live");
      }

      await sleep(50);
    }
  };

  const stopAll = async (): Promise<void> => {
    await ctx.client!.callTool({
      name: PLAYBACK,
      arguments: { action: "stop" },
    });
  };

  return {
    liveApi,
    makeLoop,
    startLoop,
    playbackSynced,
    snapshot,
    clipValue,
    readGlobalQuantization,
    setGlobalQuantization,
    waitFor,
    isClipPlaying,
    stopAll,
  };
}

/**
 * How far apart two playheads of loops of one length are, counting round the
 * loop: 0.1 and 7.95 of an 8 beat loop are 0.15 apart.
 * @param a - One position, in beats
 * @param b - The other
 * @param length - The loop length, in beats
 * @returns The distance, in beats
 */
export function loopDistance(a: number, b: number, length: number): number {
  const apart = Math.abs(a - b) % length;

  return Math.min(apart, length - apart);
}

/**
 * Where a loop's playhead should be after song time has moved on, if nothing
 * restarted it.
 * @param before - The snapshot before
 * @param after - The snapshot after
 * @param index - Which clip of the snapshots
 * @param length - The loop length, in beats
 * @returns How far the playhead is from where it would be, in beats
 */
export function restartError(
  before: Snapshot,
  after: Snapshot,
  index: number,
  length: number,
): number {
  const expected =
    (before.positions[index]! + (after.songTime - before.songTime)) % length;

  return loopDistance(after.positions[index]!, expected, length);
}

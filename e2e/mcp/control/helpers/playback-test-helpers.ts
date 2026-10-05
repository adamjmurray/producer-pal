// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Calls the playback e2e suites share: running ppal-playback, and reading back
 * what is playing.
 */
import {
  type McpTestContext,
  parseToolResult,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

export interface ClipEntry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

export interface PlaybackResult {
  playing: boolean;
  startTime?: string;
  scene?: { id: string; path?: string };
  clip?: ClipEntry | ClipEntry[];
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
}

/**
 * The playback calls, bound to a test context.
 * @param ctx - The MCP test context the suite set up
 * @returns The calls
 */
export function playbackCalls(ctx: McpTestContext): {
  callPlayback: (args: Record<string, unknown>) => Promise<unknown>;
  playback: (args: Record<string, unknown>) => Promise<PlaybackResult>;
  isPlaying: () => Promise<boolean | undefined>;
  readClip: (
    path: string,
  ) => Promise<{ playing?: boolean; triggered?: boolean }>;
  clipPlaying: (path: string) => Promise<boolean>;
  createClipOnTrack: (
    trackIndex: number,
    sceneIndex: number,
    note: string,
  ) => Promise<string>;
  createSessionClip: (sceneIndex: number, note?: string) => Promise<string>;
} {
  const callPlayback = async (
    args: Record<string, unknown>,
  ): Promise<unknown> =>
    await ctx.client!.callTool({ name: "ppal-playback", arguments: args });

  const playback = async (
    args: Record<string, unknown>,
  ): Promise<PlaybackResult> =>
    parseToolResult<PlaybackResult>(await callPlayback(args));

  // read-live-set reports isPlaying only while the transport runs.
  const isPlaying = async (): Promise<boolean | undefined> =>
    parseToolResult<{ isPlaying?: boolean }>(
      await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} }),
    ).isPlaying;

  const readClip = async (
    path: string,
  ): Promise<{ playing?: boolean; triggered?: boolean }> =>
    parseToolResult<{ playing?: boolean; triggered?: boolean }>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { path },
      }),
    );

  const clipPlaying = async (path: string): Promise<boolean> => {
    const clip = await readClip(path);

    return (clip.playing ?? clip.triggered) === true;
  };

  const createClipOnTrack = async (
    trackIndex: number,
    sceneIndex: number,
    note: string,
  ): Promise<string> => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${trackIndex}/s${sceneIndex}`,
        notes: `${note} 1|1`,
        length: "1bar",
      },
    });

    return parseToolResult<{ id: string }>(result).id;
  };

  const createSessionClip = async (
    sceneIndex: number,
    note = "C3",
  ): Promise<string> =>
    await createClipOnTrack(EMPTY_MIDI_TRACK, sceneIndex, note);

  return {
    callPlayback,
    playback,
    isPlaying,
    readClip,
    clipPlaying,
    createClipOnTrack,
    createSessionClip,
  };
}

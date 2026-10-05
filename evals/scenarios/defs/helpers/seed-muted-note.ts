// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Seeding a muted note into a clip from a scenario `setup`. No published tool
 * can mute a note, so this goes through `ppal-live-api`, which is switched on
 * for the call only. The model's tools are listed before `setup` runs, so it
 * never gets the tool.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { getLiveApiEnabled, setConfig } from "#evals/shared/config.ts";

const TOOL_LIVE_API = "ppal-live-api";
const TOOL_READ_CLIP = "ppal-read-clip";

/** The one note to write, in Ableton beats (a quarter note is 1). */
export interface MutedNote {
  /** MIDI pitch. */
  pitch: number;
  /** Start in beats from the clip's start. */
  start: number;
  /** Length in beats. */
  duration: number;
}

/** The read-clip fields this helper uses. */
interface ClipRead {
  id?: string;
  mutedNotes?: number;
}

/**
 * Add one muted note to a clip, unless it already has a muted note.
 * Throws if the clip doesn't end up reporting one, so a broken seed fails the
 * scenario instead of passing it for the wrong reason.
 *
 * @param mcpClient - MCP client for tool calls
 * @param path - Session clip path, e.g. "t3/s0"
 * @param note - The muted note to add
 */
export async function seedMutedNote(
  mcpClient: Client,
  path: string,
  note: MutedNote,
): Promise<void> {
  const before = await readClip(mcpClient, path);

  // A run against an already-open Set (`--skip-setup`) may have seeded it.
  if ((before.mutedNotes ?? 0) > 0) {
    return;
  }

  await withLiveApi(async () => {
    const result = await mcpClient.callTool({
      name: TOOL_LIVE_API,
      arguments: {
        path: `id ${before.id}`,
        operations: [
          {
            type: "call",
            method: "add_new_notes",
            // A JSON string is the only form that reaches the dictionary
            // call. Never Live's older note protocol: it opens a modal that
            // stalls every Live call.
            args: [
              JSON.stringify({
                notes: [
                  {
                    pitch: note.pitch,
                    start_time: note.start,
                    duration: note.duration,
                    velocity: 90,
                    mute: 1,
                  },
                ],
              }),
            ],
          },
        ],
      },
    });

    if (result.isError === true) {
      throw new Error(
        `seeding a muted note failed: ${extractToolResultText(result)}`,
      );
    }
  });

  // Let Live settle before the check read, as the e2e muted-note tests do.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const after = await readClip(mcpClient, path);

  if ((after.mutedNotes ?? 0) < 1) {
    throw new Error(`${path} reports no muted note after seeding one`);
  }
}

/**
 * Read a clip with its notes, so the result carries `mutedNotes` when it has any.
 *
 * @param mcpClient - MCP client for tool calls
 * @param path - Session clip path
 * @returns The clip's id and muted-note count
 */
async function readClip(mcpClient: Client, path: string): Promise<ClipRead> {
  const result = await mcpClient.callTool({
    name: TOOL_READ_CLIP,
    arguments: { path, include: ["notes"] },
  });

  if (result.isError === true) {
    throw new Error(`could not read ${path}: ${extractToolResultText(result)}`);
  }

  return parseToolResult(extractToolResultText(result)) as ClipRead;
}

/**
 * Run a callback with the Direct Live API tool on, then put it back as found
 * (a `--live-api` run keeps it on).
 *
 * @param run - What to do while the tool is available
 */
async function withLiveApi(run: () => Promise<void>): Promise<void> {
  const wasEnabled = await getLiveApiEnabled();

  await setConfig({ liveApiEnabled: true });

  try {
    await run();
  } finally {
    await setConfig({ liveApiEnabled: wasEnabled });
  }
}

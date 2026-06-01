// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared assertion helpers for clip evaluation scenarios.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText } from "#evals/chat/mcp.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../types.ts";

/** Connect tool name (turn-0 connect assertion). */
export const TOOL_CONNECT = "ppal-connect";

/** update-clip tool name. */
export const TOOL_UPDATE_CLIP = "ppal-update-clip";

/** read-clip tool name. */
export const TOOL_READ_CLIP = "ppal-read-clip";

/** Standard turn-0 message that opens a connection to Live. */
export const MSG_CONNECT = "Connect to Ableton Live";

/** Standard message to read the drum clip in scene 1 (drum scenarios). */
export const READ_DRUM_NOTES =
  "Find the drum clip in the first scene and read its notes";

/**
 * Create a custom assertion that verifies clips were found and notes were read.
 * Checks that only ppal-read-* tools were called and at least one read pulled in
 * notes — either explicitly ("notes" in the include array) or via the "*"
 * wildcard, which returns every field (notes included). A capable model often
 * reaches for `include: ["*"]` to read a clip comprehensively, and that must
 * count as reading the notes.
 *
 * @param turn - Turn index to check
 * @returns Custom assertion for clip reading
 */
export function assertNotesRead(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "clips were found and notes were read",
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn);
      let notesRead = false;

      for (const { name, args } of calls) {
        if (!name.startsWith("ppal-read-")) {
          throw new Error(`unexpected non-read tool call: ${name}`);
        }

        if (
          name !== "ppal-read-live-set" &&
          Array.isArray(args.include) &&
          (args.include.includes("notes") || args.include.includes("*"))
        ) {
          notesRead = true;
        }
      }

      if (!notesRead) {
        throw new Error("the clip notes should have been read");
      }

      return true;
    },
  };
}

/**
 * Extract the transforms expressions from a ppal-update-clip call in the given
 * turn. transforms is now a single newline-separated string; a legacy array
 * value is still tolerated and joined with newlines so selector/expression
 * parsing in callers sees the raw expression text.
 * Throws descriptive errors if the tool call or transforms parameter is missing.
 *
 * @param turns - All turn results
 * @param turn - Turn index to extract from
 * @param toolName - Tool name to look for
 * @returns The transforms expressions joined with newlines
 */
export function getTransforms(
  turns: EvalTurnResult[],
  turn: number,
  toolName: string,
): string {
  const calls = getToolCalls(turns, turn);
  const updateCall = calls.find((c) => c.name === toolName);

  if (!updateCall) throw new Error(`${toolName} not found in turn ${turn}`);

  const raw = updateCall.args.transforms;
  const transforms = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");

  if (!transforms) {
    throw new Error(`transforms parameter missing in turn ${turn}`);
  }

  return transforms;
}

/**
 * Parse a clip's notes from the last ppal-read-clip result in a turn, back into
 * NoteEvents (start_time in musical beats). Self-calibrating: reads the clip's
 * own time signature so bar math works in any meter. Returns the notes plus
 * beatsPerBar (the meter numerator) so callers can compute bar boundaries.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the read
 * @returns Parsed notes and beats-per-bar, or null if no clip read with notes
 */
export function readClipNotesFromTurn(
  turns: EvalTurnResult[],
  turn: number,
): { notes: NoteEvent[]; beatsPerBar: number } | null {
  const reads = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_READ_CLIP && c.result != null,
  );

  for (const call of reads.reverse()) {
    try {
      const parsed = JSON.parse(String(call.result)) as {
        notes?: string;
        timeSignature?: string;
      };

      if (parsed.notes == null) continue;

      const [num, den] = (parsed.timeSignature ?? "4/4").split("/").map(Number);
      const notes = interpretNotation(parsed.notes, {
        timeSigNumerator: num ?? 4,
        timeSigDenominator: den ?? 4,
      });

      return { notes, beatsPerBar: num ?? 4 };
    } catch {
      // non-JSON / unexpected shape — try the next read
    }
  }

  return null;
}

/**
 * Delete any existing session clips in the given slots. Use as a scenario
 * `setup` so repeat trials (`-r N`, which reuse the open Live Set) each start
 * with empty slots instead of inheriting clips from the previous trial.
 *
 * @param mcpClient - MCP client for tool calls
 * @param slots - Session clip slots to clear (e.g. ["0/0", "0/1", "0/2"])
 */
export async function clearSessionSlots(
  mcpClient: Client,
  slots: string[],
): Promise<void> {
  const ids: string[] = [];

  for (const slot of slots) {
    const result = await mcpClient.callTool({
      name: "ppal-read-clip",
      arguments: { slot, include: [] },
    });

    let id: unknown;

    try {
      id = (JSON.parse(extractToolResultText(result)) as { id?: unknown }).id;
    } catch {
      id = null; // empty/non-JSON slot read — nothing to delete
    }

    if (id != null) ids.push(String(id));
  }

  if (ids.length > 0) {
    await mcpClient.callTool({
      name: "ppal-delete",
      arguments: { ids: ids.join(","), type: "clip" },
    });
  }
}

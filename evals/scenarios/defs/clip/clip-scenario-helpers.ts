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
 * Parse a clip's notes from the read results in a turn, back into NoteEvents
 * (start_time in musical beats). Scans every `ppal-read-*` result, most recent
 * first — not just `ppal-read-clip`: the model is free to read a clip's notes
 * via `ppal-read-scene` (clips nested in a `clips` array) or `ppal-read-track`,
 * and a check that only understood `ppal-read-clip` would mis-grade those
 * equally valid paths. Self-calibrating: reads the clip's own time signature so
 * bar math works in any meter. Returns the notes plus beatsPerBar (the meter
 * numerator) and the clip id so callers can compute bar boundaries and match a
 * specific clip across reads.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the read
 * @param clipId - When given, only a clip whose id matches is returned (needed
 *   when a scene read returns several clips with notes)
 * @returns Parsed notes, beats-per-bar, and clip id, or null if none found
 */
export function readClipNotesFromTurn(
  turns: EvalTurnResult[],
  turn: number,
  clipId?: string,
): { notes: NoteEvent[]; beatsPerBar: number; id?: string } | null {
  const reads = getToolCalls(turns, turn).filter(
    (c) => c.name.startsWith("ppal-read-") && c.result != null,
  );

  for (const call of reads.reverse()) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(String(call.result));
    } catch {
      continue; // non-JSON read result
    }

    for (const clip of clipObjectsFrom(parsed)) {
      if (clip.notes == null) continue;

      if (clipId != null && clip.id != null && String(clip.id) !== clipId) {
        continue;
      }

      const [num, den] = (clip.timeSignature ?? "4/4").split("/").map(Number);

      try {
        const notes = interpretNotation(clip.notes, {
          timeSigNumerator: num ?? 4,
          timeSigDenominator: den ?? 4,
        });

        return { notes, beatsPerBar: num ?? 4, id: clip.id };
      } catch {
        // unparseable notation — keep scanning other clips/reads
      }
    }
  }

  return null;
}

/** Minimal clip shape the note-reading helpers care about. */
interface ClipShape {
  id?: string;
  notes?: string;
  timeSignature?: string;
}

/**
 * Extract clip-shaped objects from a parsed read-* result. A read-clip result
 * IS the clip; read-scene/read-track nest clips in `clips` (and, for arrangement
 * reads, `sessionClips`/`arrangementClips`) arrays. Returns every candidate so
 * the caller can pick the one with notes (optionally matching a clip id).
 *
 * @param parsed - A parsed JSON read result
 * @returns Candidate clip objects (the result itself plus any nested clips)
 */
function clipObjectsFrom(parsed: unknown): ClipShape[] {
  if (parsed == null || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const out: ClipShape[] = [obj];

  for (const key of ["clips", "sessionClips", "arrangementClips"]) {
    const arr = obj[key];

    if (Array.isArray(arr)) {
      for (const clip of arr) {
        if (clip != null && typeof clip === "object") {
          out.push(clip as ClipShape);
        }
      }
    }
  }

  return out;
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

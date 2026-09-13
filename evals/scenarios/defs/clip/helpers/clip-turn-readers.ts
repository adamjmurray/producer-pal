// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reading what a run did to a clip back out of its turns: the args a model
 * sent, the clip it created, the notes a read returned, and the slot cleanup a
 * scenario runs first.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { argText } from "../../arg-text.ts";
import {
  getToolCalls,
  lastSuccessfulToolCall,
  parsedToolResult,
} from "../../../assertions/index.ts";
import { type EvalTurnResult } from "../../../types.ts";
import { TOOL_CREATE_CLIP } from "./clip-tool-constants.ts";

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
  const updateCall = lastSuccessfulToolCall(turns, turn, toolName);

  if (!updateCall) {
    throw new Error(`${toolName} not found in turn ${turn}`);
  }

  const raw = updateCall.args.transforms;
  const transforms = Array.isArray(raw) ? raw.join("\n") : argText(raw);

  if (!transforms) {
    throw new Error(`transforms parameter missing in turn ${turn}`);
  }

  return transforms;
}

/**
 * Pull the raw `notes` string from a ppal-create-clip call in the given turn.
 * Throws (failing the calling assertion with a message) when the call or the
 * `notes` parameter is missing. Used by scenarios that grade HOW the model
 * notated a clip — bracket cycling, stream zips — not just the resulting notes,
 * which read back identically however they were written.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the create-clip call (default 1)
 * @returns The raw notes string passed to ppal-create-clip
 */
export function getCreateClipNotes(turns: EvalTurnResult[], turn = 1): string {
  const call = lastSuccessfulToolCall(turns, turn, TOOL_CREATE_CLIP);

  if (!call) {
    throw new Error(`ppal-create-clip not found in turn ${turn}`);
  }

  const notes = call.args.notes;

  if (typeof notes !== "string") {
    throw new Error("create-clip notes parameter is missing or not a string");
  }

  return notes;
}

/**
 * Pull the created clip's id and path from the ppal-create-clip call in the
 * given turn. Lets a grading read fetch the clip by id (wherever the model
 * placed it — small models often misjudge 0-based scene indexing) while a
 * separate assertion checks whether it landed in the intended slot.
 *
 * Both come off the RESULT, not the args. The tool takes a destination several
 * ways — `path`, the hidden trackIndex/sceneIndex alias, the tolerated old
 * "0/0" spelling — and reports back one canonical path either way. Grading the
 * args would score a model that used a spelling this reader didn't know as a
 * placement failure for a clip that landed correctly.
 *
 * Reads the last SUCCESSFUL create call: a model that hits a param error is
 * told to fix the args and retry, and grading the discarded first attempt got
 * an empty id, so the read-back died with `id "" does not exist` and failed a
 * model for recovering correctly.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the create-clip call (default 1)
 * @returns The created clip's id and path (either may be undefined if absent)
 */
export function getCreatedClip(
  turns: EvalTurnResult[],
  turn = 1,
): { id?: string; path?: string } {
  const call = lastSuccessfulToolCall(turns, turn, TOOL_CREATE_CLIP);

  if (!call) {
    return {};
  }

  const parsed = parsedToolResult(call);

  return {
    id: parsed?.id == null ? undefined : argText(parsed.id),
    path: typeof parsed?.path === "string" ? parsed.path : undefined,
  };
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

  for (const call of reads.toReversed()) {
    let parsed: unknown;

    try {
      parsed = parseToolResult(String(call.result));
    } catch {
      continue; // unparseable read result
    }

    for (const clip of clipObjectsFrom(parsed)) {
      if (clip.notes == null) {
        continue;
      }

      // When a clipId is requested, require an exact id match — skip candidates
      // with a different id AND candidates with no id, so a malformed/idless
      // nested entry can't stand in for the requested clip.
      if (clipId != null && (clip.id ?? "") !== clipId) {
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
 * Note: only these top-level arrays are scanned. Take-lane clips live deeper
 * (read-track nests them under `takeLanes[].clips`) and are NOT descended into —
 * no current scenario reads notes from a take lane. Add that traversal here if
 * one ever does.
 *
 * @param parsed - A parsed JSON read result
 * @returns Candidate clip objects (the result itself plus any nested clips)
 */
function clipObjectsFrom(parsed: unknown): ClipShape[] {
  if (parsed == null || typeof parsed !== "object") {
    return [];
  }

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
 * Convert a "trackIndex/sceneIndex" slot string into the path the clip tools
 * take. Scenario definitions still name slots in the older format, so the
 * conversion lives here rather than at every call site.
 * @param slot - Slot string, "trackIndex/sceneIndex"
 * @returns The equivalent session path, "t<track>/s<scene>"
 */
export function slotToPath(slot: string): string {
  const [trackIndex, sceneIndex] = slot.split("/");

  return `t${trackIndex}/s${sceneIndex}`;
}

/**
 * Delete any existing session clips in the given slots. Use as a scenario
 * `setup` so a run against an already-open Live Set starts with empty slots
 * instead of inheriting clips from the previous one.
 *
 * @param mcpClient - MCP client for tool calls
 * @param slots - Session clip slots to clear (e.g. ["0/0", "0/1", "0/2"])
 */
export async function clearClipSlots(
  mcpClient: Client,
  slots: string[],
): Promise<void> {
  const ids: string[] = [];

  for (const slot of slots) {
    const result = await mcpClient.callTool({
      name: "ppal-read-clip",
      arguments: { path: slotToPath(slot), include: [] },
    });

    let id: unknown;

    try {
      id = (parseToolResult(extractToolResultText(result)) as { id?: unknown })
        .id;
    } catch {
      id = null; // empty/unparseable slot read — nothing to delete
    }

    if (id != null) {
      ids.push(argText(id));
    }
  }

  if (ids.length > 0) {
    await mcpClient.callTool({
      name: "ppal-delete",
      arguments: { id: ids.join(","), type: "clip" },
    });
  }
}

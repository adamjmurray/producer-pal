// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * V8-side protocol handling for code execution feature.
 * Manages the multi-step communication with Node for sandboxed code execution.
 */

import { toCompactJSLiteral } from "#src/shared/compact-serializer.ts";
import {
  formatErrorResponse,
  formatSuccessResponse,
} from "#src/shared/mcp-response-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  applyNotesToClip,
  buildCodeExecutionContext,
  extractNotesFromClip,
  getClipNoteCount,
} from "#src/tools/clip/code-exec/code-exec-helpers.ts";
import type {
  ApplyNotesMessage,
  NotesDataMessage,
} from "#src/tools/clip/code-exec/code-exec-types.ts";

interface PendingCodeExec {
  tool: string;
  args: Record<string, unknown>;
  clips: LiveAPI[];
  view: "session" | "arrangement";
  sceneIndex?: number;
  arrangementStartBeats?: number;
}

/** Map of pending code execution requests by requestId */
const pendingCodeExecs = new Map<string, PendingCodeExec>();

/**
 * Send notes_data message to Node for code execution
 *
 * @param requestId - Request identifier
 * @param notesData - Notes and context data
 */
function sendNotesData(requestId: string, notesData: NotesDataMessage): void {
  outlet(0, "notes_data", requestId, JSON.stringify(notesData));
}

/**
 * Handle apply_notes message from Node after code execution
 *
 * @param requestId - Request identifier
 * @param applyNotesJson - JSON string of ApplyNotesMessage
 * @param sendResponse - Function to send response back to Node
 * @param isCompactOutputEnabled - Whether compact output is enabled
 */
export function handleApplyNotes(
  requestId: string,
  applyNotesJson: string,
  sendResponse: (requestId: string, result: object) => void,
  isCompactOutputEnabled: boolean,
): void {
  const state = pendingCodeExecs.get(requestId);

  if (!state) {
    console.error(`Received apply_notes for unknown request: ${requestId}`);

    return;
  }

  pendingCodeExecs.delete(requestId);

  let applyData: ApplyNotesMessage;

  try {
    applyData = JSON.parse(applyNotesJson) as ApplyNotesMessage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    sendResponse(
      requestId,
      formatErrorResponse(`Failed to parse apply_notes: ${message}`),
    );

    return;
  }

  try {
    // Apply transformed notes to each clip
    const results: Array<{ id: string; noteCount?: number }> = [];

    for (let i = 0; i < state.clips.length; i++) {
      const clip = state.clips[i];

      if (!clip) {
        continue;
      }

      const clipData = applyData.clips[i];

      if (clipData) {
        applyNotesToClip(clip, clipData.notes);
      }

      results.push({
        id: clip.id,
        noteCount: getClipNoteCount(clip),
      });
    }

    // Format and send success response
    const output =
      state.clips.length === 1 && results[0] ? results[0] : { clips: results };

    sendResponse(
      requestId,
      formatSuccessResponse(
        isCompactOutputEnabled ? toCompactJSLiteral(output) : output,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    sendResponse(
      requestId,
      formatErrorResponse(`Error applying notes: ${message}`),
    );
  }
}

/**
 * Check if args contain code param and handle code execution flow
 *
 * @param requestId - Request identifier
 * @param tool - Tool name
 * @param args - Tool arguments
 * @returns True if code execution was initiated (caller should not call tool)
 */
export function handleCodeExecIfNeeded(
  requestId: string,
  tool: string,
  args: Record<string, unknown>,
): boolean {
  const code = args.code;

  if (typeof code !== "string") {
    return false;
  }

  // Only ppal-create-clip and ppal-update-clip support code execution
  if (tool !== "ppal-create-clip" && tool !== "ppal-update-clip") {
    console.warn(`code parameter ignored for tool: ${tool}`);

    return false;
  }

  try {
    // Resolve clip(s) and extract notes/context
    const clips = resolveClipsForCodeExec(tool, args);

    if (clips.length === 0) {
      console.warn("No clips resolved for code execution");

      return false;
    }

    // Determine view and location
    const view =
      (args.view as "session" | "arrangement" | undefined) ?? "session";
    const sceneIndex = args.sceneIndex as number | undefined;
    const arrangementStartBeats = args.arrangementStart as number | undefined;

    // Store state for when apply_notes comes back
    pendingCodeExecs.set(requestId, {
      tool,
      args,
      clips,
      view,
      sceneIndex,
      arrangementStartBeats,
    });

    // Build context from first clip (shared context for all clips)
    const firstClip = clips[0];

    if (!firstClip) {
      return false;
    }

    const codeExecContext = buildCodeExecutionContext(
      firstClip,
      view,
      sceneIndex,
      arrangementStartBeats,
    );

    // Extract notes from each clip
    const clipData: NotesDataMessage["clips"] = clips.map((clip) => ({
      clipId: clip.id,
      notes: extractNotesFromClip(clip),
    }));

    // Send notes_data to Node for code execution
    const notesData: NotesDataMessage = {
      requestId,
      clips: clipData,
      context: codeExecContext,
    };

    sendNotesData(requestId, notesData);

    return true; // Code execution initiated, don't call tool normally
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.warn(`Code execution setup failed: ${message}`);

    return false; // Fall back to normal tool execution
  }
}

/**
 * Resolve clips for code execution
 *
 * @param tool - Tool name (ppal-create-clip or ppal-update-clip)
 * @param args - Tool arguments containing clip IDs
 * @returns Array of resolved LiveAPI clip objects
 */
function resolveClipsForCodeExec(
  tool: string,
  args: Record<string, unknown>,
): LiveAPI[] {
  const clips: LiveAPI[] = [];

  if (tool === "ppal-create-clip") {
    // For create-clip, we need to create the clip first, then extract
    // For now, just return empty - the notes will come from the code
    // Actually, create-clip with code should create an empty clip first
    // This is complex - for MVP, we'll handle this differently
    // TODO: Support create-clip with code by creating empty clip first
    console.warn("code parameter not yet supported for ppal-create-clip");

    return [];
  }

  // For update-clip, resolve existing clips by ID
  const ids = args.ids as string | undefined;

  if (ids == null) {
    return [];
  }

  const clipIds = ids.split(",").map((id) => id.trim());

  for (const clipId of clipIds) {
    try {
      const clip = LiveAPI.from(["id", clipId]);

      if (clip.exists()) {
        clips.push(clip);
      }
    } catch {
      // Skip invalid IDs
    }
  }

  return clips;
}

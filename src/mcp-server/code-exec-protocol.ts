// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Protocol handler for code execution multi-step communication.
 * Manages the Node-V8 back-and-forth for sandboxed code execution.
 */

import Max from "max-api";
import type {
  ApplyNotesMessage,
  CodeNote,
  NotesDataMessage,
} from "#src/tools/clip/code-exec/code-exec-types.ts";
import { executeCode } from "./code-executor.ts";
import * as console from "./node-for-max-logger.ts";

interface McpResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface CodeExecState {
  code: string;
  resolve: (value: McpResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Map of pending code execution requests by requestId */
const codeExecRequests = new Map<string, CodeExecState>();

/** Timeout for the entire code execution flow (30 seconds) */
const CODE_EXEC_FLOW_TIMEOUT_MS = 30_000;

/**
 * Register a pending code execution request.
 * Called when a tool call with `code` param is sent to V8.
 *
 * @param requestId - The request ID
 * @param code - The user's code to execute
 * @param resolve - The promise resolve function for the original tool call
 */
export function registerCodeExecRequest(
  requestId: string,
  code: string,
  resolve: (value: McpResponse) => void,
): void {
  const timeout = setTimeout(() => {
    if (codeExecRequests.has(requestId)) {
      codeExecRequests.delete(requestId);
      resolve({
        content: [{ type: "text", text: "Code execution flow timed out" }],
        isError: true,
      });
    }
  }, CODE_EXEC_FLOW_TIMEOUT_MS);

  codeExecRequests.set(requestId, { code, resolve, timeout });
}

/**
 * Check if a request is a pending code execution.
 *
 * @param requestId - The request ID
 * @returns True if this is a pending code execution request
 */
export function isCodeExecRequest(requestId: string): boolean {
  return codeExecRequests.has(requestId);
}

/**
 * Get the resolve function for a code execution request.
 * Used when the final mcp_response arrives.
 *
 * @param requestId - The request ID
 * @returns The state and clears the entry, or undefined if not found
 */
export function completeCodeExecRequest(
  requestId: string,
): CodeExecState | undefined {
  const state = codeExecRequests.get(requestId);

  if (state) {
    clearTimeout(state.timeout);
    codeExecRequests.delete(requestId);
  }

  return state;
}

/**
 * Handle notes_data message from V8.
 * Runs user code in sandbox and sends apply_notes back.
 *
 * @param requestId - The request ID
 * @param notesDataJson - JSON string of NotesDataMessage
 */
export async function handleNotesData(
  requestId: string,
  notesDataJson: string,
): Promise<void> {
  const state = codeExecRequests.get(requestId);

  if (!state) {
    console.error(`Received notes_data for unknown request: ${requestId}`);

    return;
  }

  let notesData: NotesDataMessage;

  try {
    notesData = JSON.parse(notesDataJson) as NotesDataMessage;
  } catch (error) {
    console.error(`Failed to parse notes_data: ${String(error)}`);
    // Send back original notes (no transformation)
    await sendApplyNotes(requestId, notesDataJson);

    return;
  }

  // Process each clip with the user's code
  const transformedClips: ApplyNotesMessage["clips"] = [];

  for (const clipData of notesData.clips) {
    const result = executeCode(state.code, clipData.notes, notesData.context);

    let transformedNotes: CodeNote[];

    if (result.success) {
      transformedNotes = result.notes;
    } else {
      // On error, use original notes and log warning
      console.warn(
        `Code execution failed for clip ${clipData.clipId}: ${result.error}`,
      );
      transformedNotes = clipData.notes;
    }

    transformedClips.push({
      clipId: clipData.clipId,
      notes: transformedNotes,
    });
  }

  const applyNotesMessage: ApplyNotesMessage = {
    requestId,
    clips: transformedClips,
  };

  await sendApplyNotes(requestId, JSON.stringify(applyNotesMessage));
}

/**
 * Send apply_notes message to V8.
 *
 * @param requestId - The request ID
 * @param applyNotesJson - JSON string of ApplyNotesMessage
 */
async function sendApplyNotes(
  requestId: string,
  applyNotesJson: string,
): Promise<void> {
  try {
    await Max.outlet("apply_notes", requestId, applyNotesJson);
  } catch (error) {
    const state = codeExecRequests.get(requestId);

    if (state) {
      clearTimeout(state.timeout);
      codeExecRequests.delete(requestId);
      state.resolve({
        content: [
          {
            type: "text",
            text: `Failed to send apply_notes: ${String(error)}`,
          },
        ],
        isError: true,
      });
    }
  }
}

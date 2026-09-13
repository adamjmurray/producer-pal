// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// V8 asks Node to run user code in its sandboxed VM and awaits the result.

import { oversizedSingleMessageError } from "#src/shared/mcp-responses.ts";
import {
  extractNotesFromClip,
  validateCodeNotes,
} from "#src/tools/clip/code-exec/clip-notes-exchange.ts";
import { buildCodeExecutionContext } from "#src/tools/clip/code-exec/code-execution-context.ts";
import {
  type CodeExecutionContext,
  type CodeExecutionResult,
  type CodeNote,
  type SandboxResult,
} from "#src/tools/clip/code-exec/code-exec-types.ts";
import { requestChannel } from "./request-channel.ts";

const channel = requestChannel({
  idPrefix: "code-exec-",
  requestMessage: "code_exec_request",
  responseMessage: "code_exec_result",
});

/**
 * Request code execution from Node's sandboxed VM.
 * @param code - JavaScript code to execute (pre-wrapped by caller)
 * @param globals - Named values to inject into the sandbox scope
 * @returns Promise resolving to the sandbox execution result
 */
export function requestCodeExecution(
  code: string,
  globals: Record<string, unknown> = {},
): Promise<SandboxResult> {
  const request = JSON.stringify({ code, globals });

  return channel.send<SandboxResult>(
    request,
    "Code execution",
    // A large clip's notes can push the request past the single-message IPC
    // limit, where Max would silently truncate it. Fail loudly before sending.
    oversizedSingleMessageError(request, "code-exec request"),
  );
}

/**
 * Handle code_exec_result message from Node.
 * @param requestId - Request identifier
 * @param resultJson - JSON string of SandboxResult
 */
export function handleCodeExecResult(
  requestId: string,
  resultJson: string,
): void {
  channel.receive(requestId, resultJson);
}

/**
 * Execute user code to transform notes for a clip.
 * Wraps user code, sends to Node for sandboxed execution, validates result.
 *
 * @param clip - LiveAPI clip object
 * @param userCode - User-provided JavaScript code body
 * @param view - Session or arrangement view
 * @param clipIndex - 0-based position in the current batch (for clip.index in user code)
 * @param clipCount - Total clips in the current batch (for clip.count in user code)
 * @param sceneIndex - Scene index (session only)
 * @returns Promise resolving to validated CodeExecutionResult
 */
export async function executeNoteCode(
  clip: LiveAPI,
  userCode: string,
  view: "session" | "arrangement",
  clipIndex: number,
  clipCount: number,
  sceneIndex?: number,
): Promise<CodeExecutionResult> {
  const notes = extractNotesFromClip(clip);
  const context = buildCodeExecutionContext(
    clip,
    view,
    clipIndex,
    clipCount,
    sceneIndex,
  );

  return await executeNoteCodeWithData(userCode, notes, context);
}

/**
 * Execute user code with pre-extracted notes and context.
 * Wraps user code, sends to Node for sandboxed execution, validates result.
 *
 * @param userCode - User-provided JavaScript code body
 * @param notes - Array of notes to pass to the code
 * @param context - Execution context to pass to the code
 * @returns Promise resolving to validated CodeExecutionResult
 */
export async function executeNoteCodeWithData(
  userCode: string,
  notes: CodeNote[],
  context: CodeExecutionContext,
): Promise<CodeExecutionResult> {
  // Wrap user code in a function that receives notes and context
  const wrappedCode = `(function(notes, context) { ${userCode} })(notes, context)`;

  const result = await requestCodeExecution(wrappedCode, { notes, context });

  if (!result.success) {
    return result;
  }

  return validateCodeNotes(result.result);
}

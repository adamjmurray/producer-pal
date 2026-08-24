// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * V8-side async utility for requesting code execution from Node.
 * V8 sends code + globals to Node, awaits the sandboxed result via Promise.
 */

import { oversizedSingleMessageError } from "#src/shared/mcp-response-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { suspendWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import {
  validateCodeNotes,
  buildCodeExecutionContext,
  extractNotesFromClip,
} from "#src/tools/clip/code-exec/code-exec-helpers.ts";
import {
  type CodeExecutionContext,
  type CodeExecutionResult,
  type CodeNote,
  type SandboxResult,
} from "#src/tools/clip/code-exec/code-exec-types.ts";

// Declare global Task type from Max for Live environment
declare const Task: new (callback: () => void) => {
  schedule: (ms: number) => void;
};

interface PendingCodeExec {
  resolve: (result: SandboxResult) => void;
  timeoutTask: { cancel: () => void };
}

/** Timeout for awaiting code execution result from Node */
const CODE_EXEC_AWAIT_TIMEOUT_MS = 10_000;

/** Map of pending code execution requests by requestId */
const pendingCodeExecs = new Map<string, PendingCodeExec>();

/** Simple counter for generating unique request IDs */
let nextRequestId = 1;

/**
 * Generate a unique request ID for code execution.
 *
 * @returns Unique request ID string
 */
function generateRequestId(): string {
  return `code-exec-${nextRequestId++}`;
}

/**
 * Request code execution from Node's sandboxed VM.
 * Sends the code and globals to Node, awaits the result via Promise.
 *
 * @param code - JavaScript code to execute (pre-wrapped by caller)
 * @param globals - Named values to inject into the sandbox scope
 * @returns Promise resolving to the sandbox execution result
 */
export function requestCodeExecution(
  code: string,
  globals: Record<string, unknown> = {},
): Promise<SandboxResult> {
  const requestId = generateRequestId();
  const request = JSON.stringify({ code, globals });

  // Suspended across the await: another request can start while this one waits,
  // and its warnings must not be collected against ours. See v8-warning-capture.
  return suspendWarningCapture(
    new Promise((resolve) => {
      // A large clip's notes can push the request past the single-message IPC
      // limit, where Max would silently truncate it. Fail loudly before sending.
      const tooLarge = oversizedSingleMessageError(
        request,
        "code-exec request",
      );

      if (tooLarge) {
        resolve({ success: false, error: tooLarge });

        return;
      }

      // Set up timeout using Max Task
      const timeoutCallback = (): void => {
        if (pendingCodeExecs.has(requestId)) {
          pendingCodeExecs.delete(requestId);
          resolve({
            success: false,
            error: `Code execution timed out after ${CODE_EXEC_AWAIT_TIMEOUT_MS}ms`,
          });
        }
      };

      const task = new Task(timeoutCallback);

      task.schedule(CODE_EXEC_AWAIT_TIMEOUT_MS);

      pendingCodeExecs.set(requestId, {
        resolve,
        timeoutTask: { cancel: () => task.schedule(-1) },
      });

      // Send request to Node
      outlet(0, "code_exec_request", requestId, request);
    }),
  );
}

/**
 * Handle code_exec_result message from Node.
 * Resolves the pending Promise for the matching request ID.
 *
 * @param requestId - Request identifier
 * @param resultJson - JSON string of SandboxResult
 */
export function handleCodeExecResult(
  requestId: string,
  resultJson: string,
): void {
  const pending = pendingCodeExecs.get(requestId);

  if (!pending) {
    console.error(
      `Received code_exec_result for unknown request: ${requestId}`,
    );

    return;
  }

  pendingCodeExecs.delete(requestId);
  pending.timeoutTask.cancel();

  try {
    const result = JSON.parse(resultJson) as SandboxResult;

    pending.resolve(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    pending.resolve({
      success: false,
      error: `Failed to parse code_exec_result: ${message}`,
    });
  }
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
 * @param arrangementStartBeats - Arrangement start position (arrangement only)
 * @returns Promise resolving to validated CodeExecutionResult
 */
export async function executeNoteCode(
  clip: LiveAPI,
  userCode: string,
  view: "session" | "arrangement",
  clipIndex: number,
  clipCount: number,
  sceneIndex?: number,
  arrangementStartBeats?: number,
): Promise<CodeExecutionResult> {
  const notes = extractNotesFromClip(clip);
  const context = buildCodeExecutionContext(
    clip,
    view,
    clipIndex,
    clipCount,
    sceneIndex,
    arrangementStartBeats,
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

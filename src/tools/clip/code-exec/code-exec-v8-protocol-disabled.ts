// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Disabled stub for code-exec-v8-protocol.ts.
 * Substituted by rollup when ENABLE_CODE_EXEC is not set.
 * Exports the same interface but always returns errors or no-ops.
 *
 * IMPORTANT: If this file is renamed or moved, update the alias entry in
 * config/rollup.config.mjs (codeExecAliases) to match.
 */

import type {
  CodeExecutionContext,
  CodeExecutionResult,
  CodeNote,
  SandboxResult,
} from "#src/tools/clip/code-exec/code-exec-types.ts";

const DISABLED_ERROR = "Code execution is not available";

/**
 * Stub: always returns error since code execution is disabled.
 *
 * @param _code - Unused
 * @param _globals - Unused
 * @returns Error result
 */
export async function requestCodeExecution(
  _code: string,
  _globals: Record<string, unknown> = {},
): Promise<SandboxResult> {
  return { success: false, error: DISABLED_ERROR };
}

/**
 * Stub: no-op since code execution is disabled.
 *
 * @param _requestId - Unused
 * @param _resultJson - Unused
 */
export function handleCodeExecResult(
  _requestId: string,
  _resultJson: string,
): void {
  // Code execution is disabled at build time
}

/**
 * Stub: always returns error since code execution is disabled.
 *
 * @param _clip - Unused
 * @param _userCode - Unused
 * @param _view - Unused
 * @param _sceneIndex - Unused
 * @param _arrangementStartBeats - Unused
 * @returns Error result
 */
export async function executeNoteCode(
  _clip: LiveAPI,
  _userCode: string,
  _view: "session" | "arrangement",
  _sceneIndex?: number,
  _arrangementStartBeats?: number,
): Promise<CodeExecutionResult> {
  return { success: false, error: DISABLED_ERROR };
}

/**
 * Stub: always returns error since code execution is disabled.
 *
 * @param _userCode - Unused
 * @param _notes - Unused
 * @param _context - Unused
 * @returns Error result
 */
export async function executeNoteCodeWithData(
  _userCode: string,
  _notes: CodeNote[],
  _context: CodeExecutionContext,
): Promise<CodeExecutionResult> {
  return { success: false, error: DISABLED_ERROR };
}

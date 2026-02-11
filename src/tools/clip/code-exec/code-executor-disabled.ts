// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Disabled stub for code-executor.ts.
 * Substituted by rollup when ENABLE_CODE_EXEC is not set.
 * Exports the same interface but always returns an error.
 *
 * IMPORTANT: If this file is renamed or moved, update the alias entry in
 * config/rollup.config.mjs (codeExecAliases) to match.
 */

import type { SandboxResult } from "#src/tools/clip/code-exec/code-exec-types.ts";

/**
 * Stub: always returns an error since code execution is disabled.
 *
 * @param _code - Unused
 * @param _globals - Unused
 * @param _timeoutMs - Unused
 * @returns Error result
 */
export function executeSandboxedCode(
  _code: string,
  _globals: Record<string, unknown> = {},
  _timeoutMs?: number,
): SandboxResult {
  return { success: false, error: "Code execution is not available" };
}

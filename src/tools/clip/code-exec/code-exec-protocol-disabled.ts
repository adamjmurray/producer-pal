// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Disabled stub for code-exec-protocol.ts.
 * Substituted by rolldown when ENABLE_CODE_EXEC is not set.
 * Exports the same interface but does nothing.
 *
 * IMPORTANT: If this file is renamed or moved, update its entry in
 * config/rolldown-plugin-stub-modules.mjs (CODE_EXEC_STUBS) to match.
 */

/**
 * Stub: no-op since code execution is disabled.
 *
 * @param _requestId - Unused
 * @param _requestJson - Unused
 */
export async function handleCodeExecRequest(
  _requestId: string,
  _requestJson: string,
): Promise<void> {
  // Code execution is disabled at build time
}

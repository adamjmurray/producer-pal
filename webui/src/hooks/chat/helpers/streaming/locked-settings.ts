// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isNotation, type Notation } from "#src/shared/notation";
import { DEFAULT_MAX_TOOL_STEPS } from "#webui/chat/sdk/step-budget";
import { resolveSystemInstruction } from "#webui/lib/config";

// Each resolver returns what an init should lock: the conversation's saved
// snapshot when continuing a restored chat, else the current setting for a
// brand-new one. All mirror the adapter's resolution, so the locked value
// equals what was sent.

/**
 * The per-turn tool-step budget — the exception to the rule above. There is no
 * snapshot to prefer, because the budget only changes how long a turn runs, so
 * a restored conversation takes whatever is set now.
 * @param extraParams - The init's extra params
 * @returns The effective step budget
 */
export function resolveMaxToolSteps(
  extraParams: Record<string, unknown>,
): number {
  return (
    (extraParams.maxToolSteps as number | undefined) ?? DEFAULT_MAX_TOOL_STEPS
  );
}

/**
 * The system instruction to lock, falling back to the resolved current override.
 * @param extraParams - The init's extra params (locked snapshot + current override)
 * @returns The effective system instruction to lock and send
 */
export function resolveLockedSystemInstruction(
  extraParams: Record<string, unknown>,
): string {
  return (
    (extraParams.lockedSystemInstruction as string | null) ??
    resolveSystemInstruction(
      extraParams.systemInstructionOverride as string | undefined,
    )
  );
}

/**
 * The notation to lock and send. Null when neither is present — a caller with
 * no notation of its own (voice mode, tests) sends no header and gets the
 * device global, the same contract external MCP clients have.
 * @param extraParams - The init's extra params (locked snapshot + current setting)
 * @returns The effective notation, or null to fall through to the device global
 */
export function resolveLockedNotation(
  extraParams: Record<string, unknown>,
): Notation | null {
  const locked = extraParams.lockedNotation;

  if (isNotation(locked)) {
    return locked;
  }

  return isNotation(extraParams.notation) ? extraParams.notation : null;
}

/**
 * The small-model mode to lock and send. The tool schemas and skills variant a
 * restored conversation gets must not flip when the Settings toggle moves under
 * it.
 * @param extraParams - The init's extra params (locked snapshot + current setting)
 * @returns The effective small-model mode
 */
export function resolveLockedSmallModelMode(
  extraParams: Record<string, unknown>,
): boolean {
  const locked = extraParams.lockedSmallModelMode;

  if (typeof locked === "boolean") {
    return locked;
  }

  return Boolean(extraParams.smallModelMode);
}

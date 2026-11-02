// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Targets a guard has already skipped or refused, so `force` can go ahead on
 * them. Strings only (never a LiveAPI). Lives in V8 memory: a record lasts
 * until a forced write uses it or the device reloads, and any client's skip
 * counts.
 */
const warnedTargets = new Set<string>();

/** Said in front of a guard's message when `force` came before any warning. */
const IGNORED_FORCE =
  "force:true ignored — nothing had warned about this yet. ";

/**
 * Settle `force` for a guard that is about to skip or refuse a target. Call it
 * only where the guard fires: where it wouldn't, `force` does nothing.
 *
 * `force` goes ahead only on a target the guard already blocked once, and that
 * use clears the record. Otherwise the target is recorded and the guard's
 * message comes back, with a note in front when `force` was sent.
 * @param kind - Which guard, so targets of different guards can't collide
 * @param target - What the guard protects, e.g. a chain id or a context scope
 * @param force - Whether the caller sent `force: true`
 * @param message - What the guard says when it blocks
 * @returns The message to skip or refuse with, or null when the write may go ahead
 */
export function forceGuardMessage(
  kind: string,
  target: string,
  force: boolean,
  message: string,
): string | null {
  const key = `${kind}:${target}`;

  if (force && warnedTargets.delete(key)) {
    return null;
  }

  warnedTargets.add(key);

  return force ? IGNORED_FORCE + message : message;
}

/**
 * Forget every record. Tests call it so one test's skip can't earn another's
 * force.
 * @returns Nothing
 */
export function clearForceGuardRecords(): void {
  warnedTargets.clear();
}

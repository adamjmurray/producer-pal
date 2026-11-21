// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { currentRequestId } from "#src/shared/max/v8-warning-capture.ts";

interface WarnedRecord {
  /** What was at risk when the guard warned. */
  fingerprint: string;
  /** The request that warned; only a later request's `force` can use it. */
  request: number;
}

/**
 * Targets a guard has already skipped or refused, so `force` can go ahead on
 * them. Strings and numbers only (never a LiveAPI). One record per
 * `kind:target`, and a new warning replaces the old one, so records can't pile
 * up. Lives in V8 memory: a record lasts until a forced write uses it, a newer
 * warning replaces it, or the device reloads. Any client's skip counts.
 */
const warnedTargets = new Map<string, WarnedRecord>();

/** Said in front of a guard's message when `force` came before any warning. */
const IGNORED_FORCE =
  "force:true ignored — nothing had warned about this yet. ";

/**
 * Settle `force` for a guard that is about to skip or refuse a target. Call it
 * only where the guard fires: where it wouldn't, `force` does nothing.
 *
 * `force` goes ahead only when an earlier request already blocked this target
 * while the same thing was at risk, and that use clears the record. A warning
 * raised in this request can't unlock `force` in it. Otherwise the target is
 * recorded (replacing any older record of it) and the guard's message comes
 * back, with a note in front when `force` was sent.
 * @param kind - Which guard, so targets of different guards can't collide
 * @param target - What the guard protects, e.g. a chain id or a context scope
 * @param fingerprint - Identifies what would be lost (the instrument's id, a
 *   hash of the document). A record made for something else doesn't count.
 * @param force - Whether the caller sent `force: true`
 * @param message - What the guard says when it blocks
 * @returns The message to skip or refuse with, or null when the write may go ahead
 */
export function forceGuardMessage(
  kind: string,
  target: string,
  fingerprint: string,
  force: boolean,
  message: string,
): string | null {
  const key = `${kind}:${target}`;
  const request = currentRequestId() ?? 0;
  const record = warnedTargets.get(key);

  if (
    force &&
    record != null &&
    record.fingerprint === fingerprint &&
    record.request !== request
  ) {
    warnedTargets.delete(key);

    return null;
  }

  warnedTargets.set(key, { fingerprint, request });

  return force ? IGNORED_FORCE + message : message;
}

/**
 * A short fingerprint of a text, for guards that protect a document.
 * @param text - The text
 * @returns Its length and a 32-bit hash
 */
export function textFingerprint(text: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }

  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

/**
 * Forget every record. Tests call it so one test's skip can't earn another's
 * force.
 * @returns Nothing
 */
export function clearForceGuardRecords(): void {
  warnedTargets.clear();
}

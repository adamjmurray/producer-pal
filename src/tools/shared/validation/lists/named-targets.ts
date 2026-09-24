// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The targets a call names, and the entries they leave in place of work not
// done — a skip, or an object a later target names again. Each is addressed by
// the param and spelling the caller wrote, which is all they have to match on.

import { errorMessage } from "#src/shared/error-message.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type TargetParams } from "#src/tools/shared/validation/lists/target-lists.ts";

/** One object a call names, and which param named it. */
export interface NamedTarget {
  param: "id" | "path";
  /** The entry as the caller wrote it */
  value: string;
}

/** A target a call couldn't act on. `ok` marks only these, never a hit. */
export interface TargetSkip {
  id?: string;
  path?: string;
  ok: false;
  reason: string;
}

/**
 * The targets a call names, ids first, each as the caller wrote it. Splitting
 * refuses a list with a hole in it before anything runs.
 * @param args - The call's target params, already folded onto id and path
 * @returns One entry per target named, empty when neither param named one
 */
export function namedTargets(args: TargetParams): NamedTarget[] {
  return [
    ...targetEntries(args.id, "id").map((value): NamedTarget => ({
      param: "id",
      value,
    })),
    ...pathEntries(args.path).map((value): NamedTarget => ({
      param: "path",
      value,
    })),
  ];
}

/**
 * Runs one target of a list, turning a failure into the entry that says so.
 * @param target - The target being acted on
 * @param run - What the call does to it
 * @returns What the call produced, or the skip entry standing in for it
 */
export function attemptTarget<T>(
  target: NamedTarget,
  run: () => T,
): T | TargetSkip {
  try {
    return run();
  } catch (error) {
    return skipEntry(target, errorMessage(error));
  }
}

/**
 * The entry for a target a call couldn't act on.
 * @param target - The target, as the caller named it
 * @param reason - Why it was skipped, in the words a single target would throw
 * @returns The skip entry
 */
export function skipEntry(target: NamedTarget, reason: string): TargetSkip {
  return { ...targetAddress(target), ok: false, reason };
}

/**
 * How a target says a later one named the same object, in that target's own
 * spelling — what the caller matches the working entry on. One wording for
 * every tool: the last target to name an object is the one acted on.
 * @param later - The target that named the object last
 * @returns The reason, pointing at the entry that did the work
 */
export function namedLaterReason(later: NamedTarget): string {
  const address =
    later.param === "id" ? `id ${later.value}` : `"${later.value}"`;

  return `named again as ${address} later in this call`;
}

/**
 * The reason a lone target that got nothing done throws with, since there is no
 * list for its entry to hold a place in (ADR-0042).
 * @param entries - The call's result entries, in call order
 * @returns The reason, or null when the call named more than one target or did its work
 */
export function loneRefusal(entries: object[]): string | null {
  const [only] = entries;

  return entries.length === 1 && only != null && "ok" in only
    ? (only as TargetSkip).reason
    : null;
}

// --- Helpers below main exports ---

/**
 * The address a skip reports under: the caller's own spelling, and nothing
 * else. A skip may have resolved to no object at all, so it has no id to add.
 * @param target - The target, as the caller named it
 * @returns `{ id }` or `{ path }`
 */
function targetAddress(
  target: NamedTarget,
): { id: string; path?: undefined } | { id?: undefined; path: string } {
  return target.param === "id" ? { id: target.value } : { path: target.value };
}

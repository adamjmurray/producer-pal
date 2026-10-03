// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The targets a call names, and the entries they leave in place of work not
// done — a skip, or an object a later target names again. Each is addressed by
// the param and spelling the caller wrote, which is all they have to match on.
// Holds the one wording a target the request's deadline never reached gets.

import { errorMessage } from "#src/shared/error-message.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import {
  foundId,
  type IdLookup,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { type TargetParams } from "#src/tools/shared/validation/lists/target-lists.ts";

/** One object a call names, and which param named it. */
export interface NamedTarget {
  /** `time` and `name` are how a locator is named, beside `id` */
  param: "id" | "path" | "time" | "name";
  /** The entry as the caller wrote it */
  value: string;
}

/** A target a call couldn't act on. `ok` marks only these, never a hit. */
export interface TargetSkip {
  id?: string;
  path?: string;
  time?: string;
  name?: string;
  ok: false;
  detail: string;
}

/** An entry that says only why a target was left alone, with no `ok`: the
 * work was not a failure (a later mention won). */
export interface NoteEntry {
  id?: string;
  path?: string;
  time?: string;
  name?: string;
  detail: string;
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
 * The object one target names, by whichever param named it. A path resolves the
 * same way a list read does, so a miss reads the same in either tool.
 * @param target - The target, as the caller named it
 * @param noun - What the tool acts on, singular ("track")
 * @param idAtPath - Resolves one path of this kind of object
 * @returns The object
 * @throws Error when the target names none
 */
export function targetObject(
  target: NamedTarget,
  noun: string,
  idAtPath: (entry: string) => IdLookup,
): LiveAPI {
  const id =
    target.param === "id" ? target.value : foundId(idAtPath(target.value));

  return validateIdType(id, noun);
}

/**
 * The entry for a target a call couldn't act on.
 * @param target - The target, as the caller named it
 * @param detail - Why it was skipped, in the words a single target would throw
 * @returns The skip entry
 */
export function skipEntry(target: NamedTarget, detail: string): TargetSkip {
  return { ...targetAddress(target), ok: false, detail };
}

/**
 * The entry for a target left alone for a reason that isn't a failure.
 * @param target - The target, as the caller named it
 * @param detail - Why it was left alone
 * @returns The entry, addressed as the caller spelled the target
 */
export function noteEntry(target: NamedTarget, detail: string): NoteEntry {
  return { ...targetAddress(target), detail };
}

/**
 * How a target says a later one named the same object, in that target's own
 * spelling — what the caller matches the working entry on. One wording for
 * every tool: the last target to name an object is the one acted on.
 * @param later - The target that named the object last
 * @returns The reason, pointing at the entry that did the work
 */
export function namedLaterReason(later: NamedTarget): string {
  return namedAgain(spelledAs(later));
}

/**
 * How an entry says the later one meant to replace it failed, so nothing of it
 * was written: the one wording for every tool.
 * @param by - The later mention, as the caller spelled it ("t0", id 12)
 * @returns The reason
 */
export function replacementFailedDetail(by: string): string {
  return `not written: ${by} was meant to replace it, but failed`;
}

/**
 * A target in the caller's own words: `id 12` or `"t0/s1"`.
 * @param target - The target, as the caller named it
 * @returns How an entry says which target it means
 */
export function spelledAs(target: NamedTarget): string {
  return target.param === "id" ? `id ${target.value}` : `"${target.value}"`;
}

/** Why a target got nothing: there was no time left to reach it. */
export const REQUEST_OUT_OF_TIME = "the request ran out of time";

/**
 * The detail on the skip entry of a target the deadline never reached, in one
 * wording for every tool.
 * @param rerunFor - What to re-run for, e.g. "clip" or "destination"
 * @param notDone - What wasn't done to it, when the entry should say, e.g.
 *   "not created"
 * @returns The detail
 */
export function unreachedDetail(rerunFor: string, notDone?: string): string {
  const reason = `${REQUEST_OUT_OF_TIME}; re-run for this ${rerunFor}`;

  return notDone == null ? reason : `${notDone}: ${reason}`;
}

/**
 * The stem every named-twice reason shares.
 * @param address - How the later mention spelled it, when that differs
 * @returns The stem
 */
export function namedAgain(address?: string): string {
  return address == null
    ? "named again later in this call"
    : `named again as ${address} later in this call`;
}

// --- Helpers below main exports ---

/**
 * The address a skip reports under: the caller's own spelling, and nothing
 * else. A skip may have resolved to no object at all, so it has no id to add.
 * @param target - The target, as the caller named it
 * @returns `{ id }`, `{ path }`, or for a locator `{ time }` or `{ name }`
 */
function targetAddress(target: NamedTarget): Partial<Record<string, string>> {
  return { [target.param]: target.value };
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Reading every object a call names, the way the write tools act on every one.
// `id` and `path` add up, ids first. One target reads exactly as it always did,
// throw included — a call that can do nothing has nothing to report. A target
// the request's deadline arrives before is skipped, as a write tool would.

import {
  paramNamesSomething,
  refuseNamedTwice,
} from "#src/tools/shared/helpers/param-presence.ts";
import {
  attemptTarget,
  namedTargets,
  skipEntry,
  unreachedDetailAfter,
  type NamedTarget,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  foldTargetParams,
  warnBlankTarget,
  type FoldedTargets,
  type TargetNames,
  type TargetParams,
} from "#src/tools/shared/validation/lists/target-lists.ts";

/** A read's target params, plus the names they were sent under (set by the fan-out). */
export interface ReadTargetParams extends TargetParams {
  targetNames?: TargetNames;
}

/** What a read tool returns: one object, or one entry per target named. */
export type ReadResult<T> = T | Array<T | TargetSkip>;

/** What a read tool has to say about itself to fan out. */
interface FanOutOptions {
  /** What this tool reads, singular ("clip") */
  object: string;
  /** This tool's own hidden id spelling: "clipId", "sceneId", ... */
  idAlias: string;
  /**
   * The deprecated params that name one target by themselves — "trackIndex",
   * "slot", "trackType". A list has no room for them.
   */
  oneTargetParams?: readonly string[];
  /**
   * The deprecated index params ("trackIndex", "sceneIndex"). A path names the
   * target on its own, so one sent beside it is refused.
   */
  indexParams?: readonly string[];
  /**
   * Deprecated spellings of `path` ("slot"). Each names the target on its own
   * too, so an index param beside one is refused the same way.
   */
  pathSpellings?: readonly string[];
  /** The request's deadline (ToolContext.deadline), checked before each target */
  deadline?: number | null;
}

/**
 * Reads every target a call names.
 * @param args - The call's args, with its target params as the caller sent them
 * @param options - What this tool reads, and the params it accepts
 * @param readOne - Reads one target, throwing when it names nothing or holds
 *   nothing: a lone target answers with that error, a listed one with its entry
 * @returns The object when one target was named, otherwise one entry per target
 */
export function readFanOut<A extends ReadTargetParams, T>(
  args: A,
  options: FanOutOptions,
  readOne: (args: A) => T,
): ReadResult<T> {
  const alias = paramValue(args, options.idAlias) as string | null | undefined;
  // Every target param is read once, here, so a value that names nothing says
  // so once rather than once more inside each target's own read.
  const folded = foldTargetParams(args, {
    name: options.idAlias,
    value: alias,
  });

  refuseIndexBesideTarget(args, folded.path, options);

  const targets = namedTargets(folded);
  const first = targets[0];

  if (targets.length < 2) {
    const one = readOne(withTarget(args, folded, first, options.idAlias));

    warnBlank(args, options, alias, 1);

    return one;
  }

  refuseOneTargetParams(args, options, targets.length);

  const entries = targets.map((target) => {
    const late = unreachedDetailAfter(options.deadline, options.object);

    return late == null
      ? attemptTarget(target, () =>
          readOne(withTarget(args, folded, target, options.idAlias)),
        )
      : skipEntry(target, late);
  });

  warnBlank(args, options, alias, entries.length);

  return entries;
}

// --- Helpers below main exports ---

/**
 * Refuse an index param sent beside the param that names the target on its own.
 * @param args - The call's args as the caller sent them
 * @param path - The folded `path` param
 * @param options - What this tool reads, and the params it accepts
 * @param options.object - What this tool reads, singular
 * @param options.indexParams - The deprecated index params
 * @param options.pathSpellings - Deprecated spellings of `path`
 * @throws Error when an index param arrived beside `path` or one of them
 */
function refuseIndexBesideTarget(
  args: TargetParams,
  path: string | null | undefined,
  { object, indexParams = [], pathSpellings = [] }: FanOutOptions,
): void {
  const also = Object.fromEntries(
    indexParams.map((param) => [param, paramValue(args, param)]),
  );

  for (const param of ["path", ...pathSpellings]) {
    const value = param === "path" ? path : paramValue(args, param);

    refuseNamedTwice({ param, value, noun: object, also });
  }
}

/**
 * Refuse a param that names one target by itself when the call already names
 * several. It would name a target of its own on top of the list, and each
 * entry's read would meet it again — so every entry either reads that one
 * object or is refused for naming two places at once. Nothing has run yet.
 * @param args - The call's args as the caller sent them
 * @param options - What this tool reads, and the params it accepts
 * @param options.object - What this tool reads, singular
 * @param options.oneTargetParams - Params that name one target by themselves
 * @param count - How many targets id and path named
 * @throws Error when such a param arrived beside a list
 */
function refuseOneTargetParams(
  args: TargetParams,
  { object, oneTargetParams = [] }: FanOutOptions,
  count: number,
): void {
  const sent = oneTargetParams.filter((param) =>
    paramNamesSomething(paramValue(args, param)),
  );

  if (sent.length === 0) {
    return;
  }

  const named = sent.join("/");

  throw new Error(
    `${named} names one ${object}, but id and path name ${count}. ` +
      `Name every ${object} with id or path, or drop ${named}.`,
  );
}

/**
 * Say which blank param was dropped, by the spelling the caller wrote — the
 * args as sent, since folding is what drops the blank it reports on.
 * @param args - The call's args as the caller sent them
 * @param options - What this tool reads, and the params it accepts
 * @param options.object - What this tool reads, singular
 * @param options.idAlias - This tool's own hidden id spelling
 * @param alias - That param's value, as the caller sent it
 * @param resolved - How many targets the call ended up with
 */
function warnBlank(
  args: TargetParams,
  { object, idAlias }: FanOutOptions,
  alias: string | null | undefined,
  resolved: number,
): void {
  warnBlankTarget(args, `${object}s`, resolved, {
    name: idAlias,
    value: alias,
  });
}

/**
 * The call's args aimed at one target, or at none: the param that named it
 * carries just that entry, and the other one is gone, so the single-target read
 * sees the same call it would have got on its own. The names the caller sent
 * the targets under ride along, for an error that quotes them.
 * @param args - The call's args
 * @param folded - The call's targets, folded, with the names sent
 * @param target - The target to aim them at, if any
 * @param idAlias - This tool's own id spelling
 * @returns The args for that one read
 */
function withTarget<A extends ReadTargetParams>(
  args: A,
  folded: FoldedTargets,
  target: NamedTarget | undefined,
  idAlias: string,
): A {
  return {
    ...args,
    ids: undefined,
    [idAlias]: undefined,
    paths: undefined,
    id: target?.param === "id" ? target.value : undefined,
    path: target?.param === "path" ? target.value : undefined,
    targetNames: { idParam: folded.idParam, pathParam: folded.pathParam },
  };
}

/**
 * One param of a call, by name, for the params a tool has and this file
 * doesn't.
 * @param args - The call's args
 * @param name - The param name
 * @returns Its value, whatever shape it is
 */
function paramValue(args: object, name: string): unknown {
  return (args as Record<string, unknown>)[name];
}

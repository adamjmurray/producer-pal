// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading every object a call names, the way the write tools act on every one.
//
// `id` and `path` add up, ids first. One target reads exactly as it always did,
// throw included — a call that can do nothing has nothing to report. Two or
// more get one entry each, and a target that can't be read keeps its slot as a
// miss so the entries still line up with what the caller asked for.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  namedIdParam,
  namedPathParam,
  paramNamesSomething,
} from "#src/tools/shared/helpers/param-presence.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  warnBlankTarget,
  type TargetParams,
} from "#src/tools/shared/validation/lists/target-lists.ts";

/** One object a read names, and which param named it. */
interface ReadTarget {
  param: "id" | "path";
  /** The entry as the caller wrote it */
  value: string;
}

/**
 * A target a list read couldn't read. `ok` marks only these — a hit says so by
 * being one, and read results nest inside a Live Set read, where a key per hit
 * is paid for again and again.
 */
interface ReadMiss {
  id?: string;
  path?: string;
  ok: false;
  reason: string;
}

/** What a read tool returns: one object, or one entry per target named. */
export type ReadResult<T> = T | Array<T | ReadMiss>;

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
}

/**
 * Reads every target a call names.
 * @param args - The call's args, with its target params as the caller sent them
 * @param options - What this tool reads, and the params it accepts
 * @param readOne - Reads one target, throwing when it names nothing. Its second
 *   argument says the read is one of a list, where a miss has an entry to land
 *   in and so must throw rather than warn
 * @returns The object when one target was named, otherwise one entry per target
 */
export function readFanOut<A extends TargetParams, T>(
  args: A,
  options: FanOutOptions,
  readOne: (args: A, listed: boolean) => T,
): ReadResult<T> {
  const alias = paramValue(args, options.idAlias) as string | null | undefined;
  // Every target param is read once, here, so a value that names nothing says
  // so once rather than once more inside each target's own read.
  const call = foldTargets(args, options.idAlias, alias);
  const targets = readTargets(call);
  const first = targets[0];

  if (targets.length < 2) {
    const one = readOne(first == null ? call : withTarget(call, first), false);

    warnBlank(args, options, alias, 1);

    return one;
  }

  refuseOneTargetParams(args, options, targets.length);

  const entries = targets.map((target) => readEntry(call, target, readOne));

  warnBlank(args, options, alias, entries.length);

  return entries;
}

// --- Helpers below main exports ---

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
 * The targets a call names, ids first, each as the caller wrote it. Splitting
 * refuses a list with a hole in it before anything is read.
 * @param args - The call's target params, already folded
 * @returns One entry per target named, empty when neither param named one
 */
function readTargets(args: TargetParams): ReadTarget[] {
  const ids = targetEntries(args.id, "id");
  const paths = pathEntries(args.path);

  return [
    ...ids.map((value): ReadTarget => ({ param: "id", value })),
    ...paths.map((value): ReadTarget => ({ param: "path", value })),
  ];
}

/**
 * Folds every spelling of a target onto `id` and `path`: the plural aliases and
 * the tool's own id spelling, each read once. Left where they were they would
 * ride along into every per-target read and quietly name a target there.
 * @param args - The call's args
 * @param aliasName - This tool's id alias param name
 * @param alias - That param's value
 * @returns The args with both sides folded
 */
function foldTargets<A extends TargetParams>(
  args: A,
  aliasName: string,
  alias: string | null | undefined,
): A {
  return {
    ...args,
    id: namedIdParam(namedIdParam(args.id, args.ids, "ids"), alias, aliasName),
    ids: undefined,
    [aliasName]: undefined,
    path: namedPathParam(args.path, args.paths),
    paths: undefined,
  };
}

/**
 * Reads one target of a list, turning a failure into the entry that says so.
 * @param args - The call's args
 * @param target - The target to read
 * @param readOne - Reads one target
 * @returns The object, or the miss entry standing in for it
 */
function readEntry<A extends TargetParams, T>(
  args: A,
  target: ReadTarget,
  readOne: (args: A, listed: boolean) => T,
): T | ReadMiss {
  try {
    return readOne(withTarget(args, target), true);
  } catch (error) {
    const reason = errorMessage(error);

    return target.param === "id"
      ? { id: target.value, ok: false, reason }
      : { path: target.value, ok: false, reason };
  }
}

/**
 * The call's args aimed at one target: the param that named it carries just
 * that entry, and the other one is gone, so the single-target read sees the
 * same call it would have got on its own.
 * @param args - The call's args
 * @param target - The target to aim them at
 * @returns The args for that one read
 */
function withTarget<A extends TargetParams>(args: A, target: ReadTarget): A {
  return {
    ...args,
    id: target.param === "id" ? target.value : undefined,
    path: target.param === "path" ? target.value : undefined,
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

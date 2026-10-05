// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import {
  type PairedLabels,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type ListEntries,
  splitList,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  type NamedTarget,
  namedTargets,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { refuseNoWrite } from "#src/tools/shared/validation/lists/refuse-no-write.ts";
import {
  type TargetParams,
  foldTargetParams,
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { validateTimeSignatures } from "../scene-tempo-signature.ts";

export interface UpdateSceneArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
  focus?: boolean;
}

/** An update-scene call, read once and refused if it was written wrong. */
export interface SceneCall {
  /** The target params, folded onto `id` and `path` */
  targets: TargetParams;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** The targets, ids first, each as the caller wrote it */
  named: NamedTarget[];
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string;
  focus?: boolean;
}

/** What the call pairs with its targets, once the lists are known to fit. */
export interface SceneChecked extends PairedLabels {
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignatures: ListEntries | null;
  timeSignature?: string;
  focus?: boolean;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** How many targets the call named */
  named: number;
}

/**
 * Read an update-scene call, refusing one that was written wrong before any
 * scene is touched.
 * @param args - The update-scene args
 * @returns The call, with its target params folded
 * @throws Error when the call names no scene or asks nothing of it, or its
 *   tempo is out of range
 */
export function parseSceneCall(args: UpdateSceneArgs): SceneCall {
  const { id, ids, path, paths, name, color, tempo, focus } = args;
  // Folded once: a param that names nothing warns every time it is read.
  const targets = foldTargetParams({ id, ids, path, paths });

  if (targetCount(targets) === 0) {
    throw new Error("id or path is required");
  }

  // Before the no-write refusal: a list with a hole is the first thing wrong.
  const named = namedTargets(targets);

  refuseNoWrite(args, "scenes");
  validateTempo(tempo, -1);

  return {
    targets,
    sent: { id, ids, path, paths },
    named,
    name,
    color,
    tempo,
    timeSignature: args.timeSignature ?? undefined,
    focus,
  };
}

/**
 * The lists a call has to keep the same length.
 * @param call - The update-scene call
 * @returns The lists to compare
 */
export function sceneListArgs(call: SceneCall): ListArg[] {
  return [
    { param: targetParamLabel(call.targets), count: targetCount(call.targets) },
    { param: "name", value: call.name },
    { param: "color", value: call.color },
    { param: "timeSignature", value: call.timeSignature },
  ];
}

/**
 * Pair the name, color and time signature lists with the targets named, and
 * refuse a malformed time signature before any scene is touched.
 * @param call - The update-scene call
 * @param named - How many targets the call named
 * @returns What each target takes from the lists
 * @throws Error when a color, or an entry that isn't "disabled" or an N/D time
 *   signature, can't be read
 */
export function checkSceneCall(call: SceneCall, named: number): SceneChecked {
  const { name, color, tempo, timeSignature, focus } = call;
  const timeSignatures = splitList(timeSignature, named, "timeSignature");

  validateTimeSignatures(timeSignature, timeSignatures);

  return {
    // Paired against the targets named, not the ones that resolve, so name[k]
    // and color[k] still land on target k when an earlier one is skipped.
    ...pairLabels({ noun: "scene", count: named, name, color }),
    name,
    color,
    tempo,
    timeSignatures,
    timeSignature,
    focus,
    sent: call.sent,
    named,
  };
}

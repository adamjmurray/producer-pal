// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type InsertionSpot } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  resolveCreateSceneIndex,
  resolveCreateSceneSpots,
} from "../scene-slots.ts";

export interface CreateSceneArgs {
  path?: string;
  sceneIndex?: number;
  count?: number;
  capture?: boolean;
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
  focus?: boolean;
}

/** What one target of a create-scene call carries into its write. */
export type ScenePayload =
  | { kind: "scene"; spot: InsertionSpot }
  | {
      kind: "capture";
      /** Where the captured scene goes; undefined for after the selected one */
      sceneIndex: number | undefined;
    };

/** A create-scene call, read once. */
export interface CreateSceneCall {
  args: CreateSceneArgs;
  capture: boolean;
  /** Each scene to make and the place as a path, in the order named */
  places: Array<{ data: ScenePayload; spelled: string }>;
}

/**
 * Stage 1: read where the scenes go, and refuse what the whole call gets wrong.
 * Capture makes one scene, so a count has nothing to say; a tempo outside
 * Live's range can't be written.
 * @param args - The tool's args
 * @returns The call
 * @throws Error when count comes with capture, the tempo is out of range, or a
 *   path can't be read
 */
export function parseCreateSceneCall(args: CreateSceneArgs): CreateSceneCall {
  const capture = args.capture === true;

  if (capture && args.count != null) {
    throw new Error(
      "count can't be used with capture: capture makes one scene. Drop count.",
    );
  }

  const places = capture ? capturePlace(args) : scenePlaces(args);

  validateTempo(args.tempo, -1);

  return { args, capture, places };
}

/**
 * Stage 2: one target per scene to create, or the one a capture makes.
 * @param call - The create-scene call
 * @returns The targets, in the order named
 */
export function createSceneTargets(
  call: CreateSceneCall,
): Array<Target<ScenePayload>> {
  return call.places.map(({ data, spelled }) => ({
    named: { param: "path", value: spelled },
    data,
  }));
}

/**
 * The lists a call has to keep the same length. A capture makes one scene, so
 * every value is whole.
 * @param call - The create-scene call
 * @returns The scene count, then the name, color and timeSignature lists
 */
export function createSceneLists(call: CreateSceneCall): ListArg[] {
  if (call.capture) {
    return [];
  }

  const { args } = call;

  return [
    {
      param: args.count == null ? "path" : "count",
      count: call.places.length,
      noun: "scene",
    },
    { param: "name", value: args.name },
    { param: "color", value: args.color },
    { param: "timeSignature", value: args.timeSignature },
  ];
}

// --- Helpers below main exports ---

function scenePlaces(args: CreateSceneArgs): CreateSceneCall["places"] {
  return resolveCreateSceneSpots(args.path, args.sceneIndex, args.count).map(
    ({ spot, spelled }) => ({ data: { kind: "scene", spot }, spelled }),
  );
}

function capturePlace(args: CreateSceneArgs): CreateSceneCall["places"] {
  const { path, sceneIndex } = args;
  const index = resolveCreateSceneIndex(
    path,
    sceneIndex,
    LiveAPI.from(livePath.liveSet),
  );

  return [
    {
      data: { kind: "capture", sceneIndex: index },
      spelled:
        pathEntries(path, "path")[0] ??
        formatObjectPath(
          index == null
            ? { kind: "new-scene" }
            : { kind: "scene", sceneIndex: index },
        ),
    },
  ];
}

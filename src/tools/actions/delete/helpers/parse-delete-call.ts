// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { idOrPathRequired } from "#src/tools/shared/validation/id-validation.ts";
import { DELETABLE_TYPES } from "#src/tools/constants.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { type TargetParams } from "#src/tools/shared/validation/lists/target-lists.ts";

const DELETABLE_TYPE_LIST = DELETABLE_TYPES.map((type) => `"${type}"`).join(
  ", ",
);

export interface DeleteArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  type: string;
}

/** A delete call, read once. */
export interface DeleteCall {
  type: string;
  /** The targets, folded onto the canonical params */
  ids?: string;
  path?: string;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
}

/**
 * Read a delete call, refusing one that names no type or target.
 * @param args - The delete args
 * @returns The call, with its target params folded
 * @throws Error when the type is missing or unknown, or no target is named
 */
export function parseDeleteCall(args: DeleteArgs): DeleteCall {
  const { type } = args;

  if (!type) {
    throw new Error("type is required");
  }

  if (!(DELETABLE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`type must be one of ${DELETABLE_TYPE_LIST}`);
  }

  const ids = namedIdParam(args.id, args.ids, "ids");
  const path = namedPathParam(args.path, args.paths);

  if (ids == null && path == null) {
    throw new Error(idOrPathRequired());
  }

  return {
    type,
    ids,
    path,
    sent: { id: args.id, ids: args.ids, path: args.path, paths: args.paths },
  };
}

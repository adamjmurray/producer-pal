// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { whereObjectIs } from "#src/tools/shared/write-pipeline/where-object-is.ts";
import { type Locate } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type DuplicateCall } from "./duplicate-call-types.ts";

/**
 * Where a duplicate call's sources are now. A copy inserts a track, scene or
 * device beside its source, so a later copy's source path can name another
 * object by the end of the call. A lane copy has no source path to look up: its
 * targets never carry what their path named at the start.
 */
export const locateSources: Locate<DuplicateCall> = {
  idAt: (path, { type }) => resolvePathForType(type, path).id,
  whereIs: (id) => whereObjectIs(id),
};

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { pastTheEndReason } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import {
  makesContainer,
  peekContainer,
} from "#src/tools/shared/device/helpers/path/insertion-order.ts";
import { resolveDeviceTypeSegments } from "#src/tools/shared/device/helpers/path/device-type-segments.ts";
import {
  requireDeviceContainer,
  type DeviceContainerPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * Refuse an index past the end of a chain the path would have to make first. A
 * chain that doesn't exist holds no devices, so only index 0 (or `d+`) is in
 * range there. Checked before any chain is made: resolving the path creates
 * them, and a refusal after that would leave chains behind.
 * @param path - One path entry
 * @throws Error when the path names a slot past the end of a chain it creates
 */
export function refuseIndexInNewChain(path: string): void {
  let parsed: DeviceContainerPath;

  try {
    parsed = requireDeviceContainer(parseObjectPath(path, "path"), "path");
  } catch {
    // Unparsable paths were refused before this runs. This is a path that
    // names something a device doesn't go in (a scene); its write skips it.
    return;
  }

  const { segments, namesNothing } = resolveDeviceTypeSegments(
    parsed.root,
    parsed.segments,
  );
  const last = segments.at(-1);

  if (
    namesNothing != null ||
    parsed.appendsChain ||
    parsed.appendsDevice ||
    last?.kind !== "device" ||
    last.index === 0
  ) {
    return;
  }

  const container = segments.slice(0, -1);
  const newest = container.at(-1);
  const memo = new Map<string, LiveAPI[]>();

  if (
    newest == null ||
    newest.kind === "device" ||
    newest.kind === "return-chain" ||
    peekContainer(parsed.root, container, memo) != null
  ) {
    return;
  }

  // The container is missing: it is only made when what holds it is there and
  // takes chains. Anything else fails its own way while resolving.
  const makesIt = makesContainer(
    peekContainer(parsed.root, container.slice(0, -1), memo),
    container,
  );

  if (makesIt) {
    throw new Error(pastTheEndReason(last.index, 0, path) as string);
  }
}

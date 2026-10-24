// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finds the files a Max patcher's boxes point at: images, scripts, and other
// patchers used as bpatchers or abstractions.

export interface PatcherBox {
  maxclass?: string;
  text?: string;
  filename?: string;
  pic?: string;
  name?: string;
  patcher?: PatcherContents;
}

export interface PatcherContents {
  boxes?: { box: PatcherBox }[];
}

export interface PatcherReference {
  /** File name, relative to the device folder. */
  name: string;
  /** True when a `node.script` box runs it. */
  nodeScript: boolean;
}

const SCRIPT_OBJECTS = new Set(["v8", "js", "jsui", "v8ui", "node.script"]);

/**
 * List the files a patcher's boxes reference, last box first, with a box's own
 * subpatcher right after it. Max lists dependencies in this order.
 *
 * @param patcher - The patcher JSON's `patcher` object
 * @param patcherExists - Whether `<name>.maxpat` exists (an abstraction call)
 * @returns References in order, one per file per box
 */
export function listPatcherReferences(
  patcher: PatcherContents,
  patcherExists: (fileName: string) => boolean,
): PatcherReference[] {
  const references: PatcherReference[] = [];

  for (const { box } of (patcher.boxes ?? []).toReversed()) {
    references.push(...boxReferences(box, patcherExists));

    if (box.patcher != null) {
      references.push(...listPatcherReferences(box.patcher, patcherExists));
    }
  }

  return references;
}

// List the files one box references.
function boxReferences(
  box: PatcherBox,
  patcherExists: (fileName: string) => boolean,
): PatcherReference[] {
  const names = [box.pic, box.filename];

  if (box.maxclass === "bpatcher") {
    names.push(box.name);
  }

  const [object, argument] = (box.text ?? "").trim().split(/\s+/);
  const isObject = box.maxclass === "newobj" && object != null;

  if (
    isObject &&
    SCRIPT_OBJECTS.has(object) &&
    argument?.startsWith("@") === false
  ) {
    names.push(argument);
  } else if (isObject && patcherExists(`${object}.maxpat`)) {
    names.push(`${object}.maxpat`);
  }

  const nodeScript = isObject && object === "node.script";
  const unique = new Set(
    names.filter((n): n is string => n != null && n !== "").map(stripDotSlash),
  );

  return [...unique].map((name) => ({ name, nodeScript }));
}

// Drop a leading `./`.
function stripDotSlash(name: string): string {
  return name.startsWith("./") ? name.slice(2) : name;
}

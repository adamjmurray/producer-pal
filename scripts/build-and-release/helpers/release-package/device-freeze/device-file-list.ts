// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Works out which files go into a frozen device, and in what order, from the
// unfrozen patcher itself. Nothing here is a hand-kept list.
//
// Order (matches Max's own freeze):
//   1. The project's patchers, last one first. Each is followed by the files
//      its boxes use (last box first), and those by theirs.
//   2. Files the main patcher's boxes use (scripts and the like).
//   3. The project's media, then its other files, each last one first.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  listPatcherReferences,
  type PatcherContents,
} from "./patcher-references.ts";

export interface DeviceFile {
  /** Name in the frozen listing. */
  name: string;
  /** Where it lives on disk. */
  path: string;
  /** True when a `node.script` box runs it. */
  nodeScript: boolean;
}

export interface DeviceFileList {
  files: DeviceFile[];
  /** Project entries that were not on disk and are left out. */
  warnings: string[];
}

interface ProjectEntry {
  singleton?: { projectrelativepath?: string };
}

interface DevicePatcher extends PatcherContents {
  project?: {
    contents?: Partial<Record<ProjectSection, Record<string, ProjectEntry>>>;
  };
}

type ProjectSection = "patchers" | "media" | "other";

/**
 * List the files to freeze with the main patcher.
 *
 * @param deviceDir - The folder holding the unfrozen device
 * @param patcher - The device JSON's `patcher` object
 * @returns The files in freeze order, and warnings for missing project entries
 */
export function listDeviceFiles(
  deviceDir: string,
  patcher: DevicePatcher,
): DeviceFileList {
  const collector = new FileCollector(deviceDir);
  const contents = patcher.project?.contents ?? {};

  for (const [name, entry] of projectEntries(contents.patchers)) {
    collector.addProjectFile(name, entry, true);
  }

  collector.addReferences(patcher, "Producer_Pal.amxd");

  for (const section of ["media", "other"] as const) {
    for (const [name, entry] of projectEntries(contents[section])) {
      collector.addProjectFile(name, entry, false);
    }
  }

  return { files: [...collector.files.values()], warnings: collector.warnings };
}

// A project section's entries, last one first.
function projectEntries(
  section: Record<string, ProjectEntry> | undefined,
): [string, ProjectEntry][] {
  return Object.entries(section ?? {}).toReversed();
}

class FileCollector {
  readonly files = new Map<string, DeviceFile>();
  readonly warnings: string[] = [];

  private readonly deviceDir: string;

  constructor(deviceDir: string) {
    this.deviceDir = deviceDir;
  }

  // Add a project entry and, for a patcher, the files it uses.
  addProjectFile(name: string, entry: ProjectEntry, isPatcher: boolean): void {
    const folder = entry.singleton?.projectrelativepath ?? ".";
    const path = join(this.deviceDir, folder, name);

    if (!existsSync(path)) {
      this.warnings.push(
        `${name} is in the device's project but not at ${path}. Left out.`,
      );

      return;
    }

    this.add({ name: basename(name), path, nodeScript: false });

    if (isPatcher) {
      this.addReferences(readPatcher(path), name);
    }
  }

  // Add every file a patcher's boxes use, following patchers it uses.
  addReferences(patcher: PatcherContents, from: string): void {
    const references = listPatcherReferences(patcher, (fileName) =>
      existsSync(join(this.deviceDir, fileName)),
    );

    for (const { name, nodeScript } of references) {
      const path = join(this.deviceDir, name);

      if (!existsSync(path)) {
        throw new Error(
          `${from} uses ${name}, but ${path} does not exist. ` +
            "Run `npm run build:debug` (or `npm run build`) first.",
        );
      }

      const isNew = this.add({ name: basename(name), path, nodeScript });

      if (isNew && name.endsWith(".maxpat")) {
        this.addReferences(readPatcher(path), name);
      }
    }
  }

  // Add a file; returns false when it was already listed.
  private add(file: DeviceFile): boolean {
    const existing = this.files.get(file.name);

    if (existing == null) {
      this.files.set(file.name, file);

      return true;
    }

    if (existing.path !== file.path) {
      throw new Error(
        `Two files are named ${file.name}: ${existing.path} and ${file.path}.`,
      );
    }

    existing.nodeScript ||= file.nodeScript;

    return false;
  }
}

// Read a .maxpat file's `patcher` object.
function readPatcher(path: string): PatcherContents {
  const json = JSON.parse(readFileSync(path, "utf8")) as {
    patcher: PatcherContents;
  };

  return json.patcher;
}

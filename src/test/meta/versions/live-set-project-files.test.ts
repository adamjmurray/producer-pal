// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  projectRoot,
  TEST_LIVE_SET_DIRS,
} from "#src/test/helpers/meta-test-helpers.ts";

// A Set can find a file relative to its Live project folder (freeze audio
// does). Live only treats a folder as a project when it holds
// "Ableton Project Info/", and git drops that folder when it's empty. Without
// it, a fresh clone opens the Set with the files missing, and a frozen track
// raises a dialog that blocks every e2e test.
const PROJECT_INFO = "Ableton Project Info";

// RelativePathType 3 is "relative to the project folder".
const PROJECT_FILE_REF =
  /<RelativePathType Value="3" \/>\s*<RelativePath Value="([^"]*)" \/>/g;

// Live's own backups of a Set, which git ignores.
const BACKUP_FOLDER = "Backup";

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

describe("test Live Sets' project files", () => {
  const sets = TEST_LIVE_SET_DIRS.flatMap((dir) =>
    readdirSync(path.join(projectRoot, dir), { recursive: true })
      .map(String)
      .filter(
        (entry) =>
          entry.endsWith(".als") &&
          !entry.split(path.sep).includes(BACKUP_FOLDER),
      )
      .map((entry) => path.join(dir, entry)),
  ).toSorted();
  const withProjectFiles = sets
    .map((set) => ({ set, files: projectFiles(set) }))
    .filter(({ files }) => files.length > 0);

  it("finds a Set with project files", () => {
    // Without this the suite passes by finding nothing.
    expect(withProjectFiles.length).toBeGreaterThan(0);
  });

  it.each(withProjectFiles)("$set opens in a clone", ({ set, files }) => {
    const project = projectFolder(set);

    if (project == null) {
      expect.fail(
        `${set} uses files relative to its project folder, but no folder ` +
          `above it holds "${PROJECT_INFO}/". Commit ` +
          `"${PROJECT_INFO}/.gitkeep" in the project folder.`,
      );
    }

    const missing = files.filter(
      (file) => !existsSync(path.join(projectRoot, project, file)),
    );

    expect(missing, `${set} uses files missing from ${project}`).toStrictEqual(
      [],
    );
  });
});

/**
 * Lists the files a Set finds relative to its project folder.
 * @param set - Repo-relative path to the Set
 * @returns Each file's path relative to the project folder
 */
function projectFiles(set: string): string[] {
  const xml = gunzipSync(readFileSync(path.join(projectRoot, set))).toString(
    "utf8",
  );

  return [...xml.matchAll(PROJECT_FILE_REF)].map(([, file]) =>
    (file as string).replaceAll(
      /&(?:amp|lt|gt|quot|apos);/g,
      (entity) => XML_ENTITIES[entity] as string,
    ),
  );
}

/**
 * Finds the Live project folder a Set belongs to: the nearest folder above it
 * holding "Ableton Project Info/".
 * @param set - Repo-relative path to the Set
 * @returns The project folder, repo-relative, or undefined when there is none
 */
function projectFolder(set: string): string | undefined {
  for (let dir = path.dirname(set); dir !== "."; dir = path.dirname(dir)) {
    if (existsSync(path.join(projectRoot, dir, PROJECT_INFO))) {
      return dir;
    }
  }

  return undefined;
}

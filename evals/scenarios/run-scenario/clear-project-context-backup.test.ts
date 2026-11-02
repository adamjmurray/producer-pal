// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectContextSidecarPath } from "#src/mcp-server/helpers/project-context-backup/project-context-sidecar-path.ts";
import { clearProjectContextBackup } from "./clear-project-context-backup.ts";

describe("clearProjectContextBackup", () => {
  let projectDir: string;
  let liveSetPath: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "eval-sidecar-"));
    liveSetPath = join(projectDir, "Set.als");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("deletes the backup an earlier scenario left beside the Set", () => {
    writeFileSync(projectContextSidecarPath(liveSetPath), "# Project", "utf8");

    clearProjectContextBackup(liveSetPath);

    expect(existsSync(projectContextSidecarPath(liveSetPath))).toBe(false);
  });

  it("does nothing when there is no backup", () => {
    expect(() => clearProjectContextBackup(liveSetPath)).not.toThrow();
  });

  it("throws when the backup can't be deleted", () => {
    // A directory in its place: rmSync refuses it without `recursive`.
    mkdirSync(projectContextSidecarPath(liveSetPath));

    expect(() => clearProjectContextBackup(liveSetPath)).toThrow(
      "is a directory",
    );
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteProjectContextSidecar,
  projectContextSidecarPath,
  readProjectContextSidecar,
  writeProjectContextSidecar,
} from "../project-context-backup-store.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

let projectDir = "";
let liveSetPath = "";

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "ppal-proj-"));
  liveSetPath = join(projectDir, "MySong.als");
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("projectContextSidecarPath", () => {
  it("puts the sidecar beside the .als, keyed on the folder not the basename", () => {
    expect(projectContextSidecarPath(liveSetPath)).toBe(
      join(projectDir, "Producer Pal Project Context.md"),
    );
    // A different .als in the same folder resolves to the SAME sidecar.
    expect(projectContextSidecarPath(join(projectDir, "Other.als"))).toBe(
      projectContextSidecarPath(liveSetPath),
    );
  });

  // Folder keying is a REQUIREMENT, not an implementation detail: a Live
  // Project is a folder of Sets that share one set of project notes. These pin
  // the two properties basename keying would break. See the store's header.
  it("shares one sidecar across every variation of a Set in a project", () => {
    const variations = ["Song.als", "Song (alt mix).als", "Song v2.als"].map(
      (name) => projectContextSidecarPath(join(projectDir, name)),
    );

    expect(new Set(variations).size).toBe(1);
  });

  it("survives renaming a Set inside the project folder", () => {
    expect(projectContextSidecarPath(join(projectDir, "Song.als"))).toBe(
      projectContextSidecarPath(join(projectDir, "Song renamed.als")),
    );
  });

  it("follows the project folder when it moves", () => {
    const moved = join(tmpdir(), "Moved Project", "Song.als");

    expect(projectContextSidecarPath(moved)).toBe(
      join(tmpdir(), "Moved Project", "Producer Pal Project Context.md"),
    );
  });
});

describe("readProjectContextSidecar", () => {
  it("returns null when no sidecar exists", () => {
    expect(readProjectContextSidecar(liveSetPath)).toBeNull();
  });

  it("returns the sidecar contents verbatim when present", () => {
    writeFileSync(
      projectContextSidecarPath(liveSetPath),
      "  Keep this exactly.\n\n",
      "utf8",
    );

    expect(readProjectContextSidecar(liveSetPath)).toBe(
      "  Keep this exactly.\n\n",
    );
  });

  it("returns null (not throw) when the sidecar path is unreadable", () => {
    // A directory at the sidecar path exists but can't be read as a file.
    mkdirSync(projectContextSidecarPath(liveSetPath));

    expect(readProjectContextSidecar(liveSetPath)).toBeNull();
  });
});

describe("writeProjectContextSidecar", () => {
  it("writes the blob and round-trips byte-for-byte", () => {
    writeProjectContextSidecar(liveSetPath, "Genre: jungle\nBPM: 170");

    expect(readProjectContextSidecar(liveSetPath)).toBe(
      "Genre: jungle\nBPM: 170",
    );
  });

  it("overwrites an existing sidecar", () => {
    writeProjectContextSidecar(liveSetPath, "first");
    writeProjectContextSidecar(liveSetPath, "second");

    expect(readProjectContextSidecar(liveSetPath)).toBe("second");
  });
});

describe("deleteProjectContextSidecar", () => {
  it("deletes an existing sidecar and reports true", () => {
    writeProjectContextSidecar(liveSetPath, "gone soon");

    expect(deleteProjectContextSidecar(liveSetPath)).toBe(true);
    expect(readProjectContextSidecar(liveSetPath)).toBeNull();
  });

  it("reports false when there is no sidecar", () => {
    expect(deleteProjectContextSidecar(liveSetPath)).toBe(false);
  });
});

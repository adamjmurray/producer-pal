// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  it("reports absent when no sidecar exists", () => {
    expect(readProjectContextSidecar(liveSetPath)).toStrictEqual({
      status: "absent",
    });
  });

  it("returns the sidecar contents verbatim when present", () => {
    writeFileSync(
      projectContextSidecarPath(liveSetPath),
      "  Keep this exactly.\n\n",
      "utf8",
    );

    expect(readProjectContextSidecar(liveSetPath)).toStrictEqual({
      status: "found",
      content: "  Keep this exactly.\n\n",
    });
  });

  it("reports unreadable, apart from absent, when the read fails", () => {
    // A directory at the sidecar path exists but can't be read as a file. The
    // two must not collapse: a caller may create a backup that isn't there, but
    // must never write over one it couldn't look at.
    mkdirSync(projectContextSidecarPath(liveSetPath));

    expect(readProjectContextSidecar(liveSetPath)).toStrictEqual({
      status: "unreadable",
    });
  });
});

describe("writeProjectContextSidecar", () => {
  it("writes the blob and round-trips byte-for-byte", () => {
    expect(
      writeProjectContextSidecar(liveSetPath, "Genre: jungle\nBPM: 170"),
    ).toBe(true);
    expect(readProjectContextSidecar(liveSetPath)).toStrictEqual({
      status: "found",
      content: "Genre: jungle\nBPM: 170",
    });
  });

  it("overwrites an existing sidecar", () => {
    writeProjectContextSidecar(liveSetPath, "first");
    writeProjectContextSidecar(liveSetPath, "second");

    expect(readProjectContextSidecar(liveSetPath)).toStrictEqual({
      status: "found",
      content: "second",
    });
  });

  it("reports false instead of throwing when the write fails", () => {
    // The project folder is the user's, so a write can fail for reasons we don't
    // control. Throwing would fail the RPC, which V8 won't memoize — so it would
    // retry, and warn into the tool result, on every call from then on.
    const missingFolder = join(projectDir, "gone", "Song.als");

    expect(writeProjectContextSidecar(missingFolder, "notes")).toBe(false);
  });

  it("cleans up the temp file a failed write leaves in the project folder", () => {
    // temp+rename is atomic, but failing at the rename leaves
    // "Producer Pal Project Context.md.tmp" sitting beside the user's Sets.
    const path = projectContextSidecarPath(liveSetPath);

    mkdirSync(path); // the temp write lands, then renaming onto a directory fails

    expect(writeProjectContextSidecar(liveSetPath, "notes")).toBe(false);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("still reports false when even the temp-file cleanup fails", () => {
    // A directory at the temp path fails the write AND the non-recursive rm.
    mkdirSync(`${projectContextSidecarPath(liveSetPath)}.tmp`);

    expect(writeProjectContextSidecar(liveSetPath, "notes")).toBe(false);
  });
});

describe("deleteProjectContextSidecar", () => {
  it("deletes an existing sidecar and reports true", () => {
    writeProjectContextSidecar(liveSetPath, "gone soon");

    expect(deleteProjectContextSidecar(liveSetPath)).toBe(true);
    expect(readProjectContextSidecar(liveSetPath)).toStrictEqual({
      status: "absent",
    });
  });

  it("reports false when there is no sidecar", () => {
    expect(deleteProjectContextSidecar(liveSetPath)).toBe(false);
  });

  it("reports false instead of throwing when the delete fails", () => {
    // Same reason as the write path: a throw becomes a retrying failed RPC.
    mkdirSync(projectContextSidecarPath(liveSetPath));

    expect(deleteProjectContextSidecar(liveSetPath)).toBe(false);
  });
});

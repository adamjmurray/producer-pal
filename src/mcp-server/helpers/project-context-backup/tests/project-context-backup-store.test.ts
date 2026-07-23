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

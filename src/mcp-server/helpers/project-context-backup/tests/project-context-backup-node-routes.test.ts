// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import { dispatchNodeRoute } from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { registerProjectContextBackupNodeRoutes } from "../project-context-backup-node-routes.ts";
import {
  projectContextSidecarPath,
  readProjectContextSidecar,
} from "../project-context-backup-store.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

let projectDir = "";
let liveSetPath = "";
const setProjectContext = vi.fn<(content: string) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  projectDir = mkdtempSync(join(tmpdir(), "ppal-proj-"));
  liveSetPath = join(projectDir, "MySong.als");
  registerProjectContextBackupNodeRoutes({ setProjectContext });
});

afterEach(() => {
  clearNodeRoutes();
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * Seed a sidecar file beside the test Live Set.
 * @param content - Content to write to the sidecar
 */
function seedSidecar(content: string): void {
  writeFileSync(projectContextSidecarPath(liveSetPath), content, "utf8");
}

describe("projectContext.sync — unsaved set", () => {
  it("does nothing when filePath is null", async () => {
    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: null,
      content: "anything",
      allowRestore: true,
    });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("does nothing when filePath is an empty string", async () => {
    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: "",
      content: "anything",
      allowRestore: true,
    });

    expect(res.result).toStrictEqual({ action: "none" });
  });

  it("does nothing when args are missing entirely", async () => {
    const res = await dispatchNodeRoute("projectContext.sync", null);

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

describe("projectContext.sync — restore (empty param, first sync)", () => {
  it("restores from a sidecar with real content", async () => {
    seedSidecar("Genre: jungle");

    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: true,
    });

    expect(res.result).toStrictEqual({
      action: "restore",
      content: "Genre: jungle",
    });
    expect(setProjectContext).toHaveBeenCalledWith("Genre: jungle");
  });

  it("does not restore when there is no sidecar", async () => {
    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: true,
    });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only sidecar as no backup", async () => {
    seedSidecar("   \n  ");

    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: true,
    });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("treats non-string content as empty", async () => {
    // content omitted → typeof !== "string" → "" → empty-param path.
    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      allowRestore: true,
    });

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

describe("projectContext.sync — clear (empty param, later sync)", () => {
  it("deletes the sidecar when the user clears (not first sync)", async () => {
    seedSidecar("Genre: jungle");

    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: false,
    });

    expect(res.result).toStrictEqual({ action: "clear" });
    expect(existsSync(projectContextSidecarPath(liveSetPath))).toBe(false);
    // A clear must NOT restore the old content back into the param.
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no sidecar to clear", async () => {
    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: false,
    });

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

describe("projectContext.sync — backup (non-empty param)", () => {
  it("writes a sidecar when none exists (first save / Save-As)", async () => {
    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "Genre: jungle",
      allowRestore: false,
    });

    expect(res.result).toStrictEqual({ action: "backup" });
    expect(readProjectContextSidecar(liveSetPath)).toBe("Genre: jungle");
  });

  it("overwrites a stale sidecar", async () => {
    seedSidecar("old");

    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "new",
      allowRestore: false,
    });

    expect(res.result).toStrictEqual({ action: "backup" });
    expect(readProjectContextSidecar(liveSetPath)).toBe("new");
  });

  it("leaves a byte-identical sidecar untouched", async () => {
    seedSidecar("same");

    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "same",
      allowRestore: false,
    });

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

describe("projectContext.sync — two Live Sets sharing a project folder", () => {
  // The bug this pins: sidecars used to be keyed on the folder alone, so the
  // ordinary Save-As-in-place workflow gave both Sets one shared backup. The
  // second Set's backup clobbered the first's, and a post-upgrade restore then
  // silently loaded the wrong Set's notes.
  const altMixPath = () => join(projectDir, "MySong (alt mix).als");

  it("backs each Set up without clobbering the other", async () => {
    await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "Genre: jungle",
      allowRestore: false,
    });
    await dispatchNodeRoute("projectContext.sync", {
      filePath: altMixPath(),
      content: "Genre: dub techno",
      allowRestore: false,
    });

    expect(readProjectContextSidecar(liveSetPath)).toBe("Genre: jungle");
    expect(readProjectContextSidecar(altMixPath())).toBe("Genre: dub techno");
  });

  it("restores each Set's own notes after a device upgrade", async () => {
    seedSidecar("Genre: jungle");
    writeFileSync(
      projectContextSidecarPath(altMixPath()),
      "Genre: dub techno",
      "utf8",
    );

    // Both params are empty — the upgraded device starts fresh in each Set.
    const restored = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: true,
    });

    // dispatchNodeRoute reads Max.outlet's FIRST recorded call, so the second
    // dispatch needs a clean mock or it just re-reads the first response.
    vi.mocked(Max.outlet).mockClear();
    const restoredAlt = await dispatchNodeRoute("projectContext.sync", {
      filePath: altMixPath(),
      content: "",
      allowRestore: true,
    });

    expect(restored.result).toStrictEqual({
      action: "restore",
      content: "Genre: jungle",
    });
    expect(restoredAlt.result).toStrictEqual({
      action: "restore",
      content: "Genre: dub techno",
    });
  });

  it("clears only the Set whose context was cleared", async () => {
    seedSidecar("Genre: jungle");
    writeFileSync(
      projectContextSidecarPath(altMixPath()),
      "Genre: dub techno",
      "utf8",
    );

    const res = await dispatchNodeRoute("projectContext.sync", {
      filePath: liveSetPath,
      content: "",
      allowRestore: false,
    });

    expect(res.result).toStrictEqual({ action: "clear" });
    expect(existsSync(projectContextSidecarPath(liveSetPath))).toBe(false);
    expect(readProjectContextSidecar(altMixPath())).toBe("Genre: dub techno");
  });
});

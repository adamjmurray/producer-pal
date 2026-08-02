// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import { dispatchNodeRoute } from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { registerProjectContextBackupNodeRoutes } from "../project-context-backup-node-routes.ts";
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

// Real filesystem behavior by default; a couple of tests override one call to
// stage a failure the filesystem won't reproduce on demand.
vi.mock(import("../project-context-backup-store.ts"), { spy: true });

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

/**
 * Read back the sidecar beside the test Live Set.
 * @returns Its contents, or null when there is nothing readable there
 */
function sidecarText(): string | null {
  const read = readProjectContextSidecar(liveSetPath);

  return read.status === "found" ? read.content : null;
}

/**
 * Dispatch projectContext.sync against the test Live Set.
 * @param args - Sync args other than filePath; omitting `content` exercises the
 *   non-string path
 * @returns The route response
 */
async function sync(args: {
  content?: string;
  allowRestore?: boolean;
  isEdit?: boolean;
}) {
  return await dispatchNodeRoute("projectContext.sync", {
    filePath: liveSetPath,
    ...args,
  });
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

    const res = await sync({ content: "", allowRestore: true });

    expect(res.result).toStrictEqual({
      action: "restore",
      content: "Genre: jungle",
    });
    expect(setProjectContext).toHaveBeenCalledWith("Genre: jungle");
  });

  it("does not restore when there is no sidecar", async () => {
    const res = await sync({ content: "", allowRestore: true });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only sidecar as no backup", async () => {
    seedSidecar("   \n  ");

    const res = await sync({ content: "", allowRestore: true });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("treats non-string content as empty", async () => {
    // content omitted → typeof !== "string" → "" → empty-param path.
    const res = await sync({ allowRestore: true });

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

describe("projectContext.sync — clear (empty param, later sync)", () => {
  it("deletes the sidecar when the user clears (not first sync)", async () => {
    seedSidecar("Genre: jungle");

    const res = await sync({ content: "", allowRestore: false });

    expect(res.result).toStrictEqual({ action: "clear" });
    expect(existsSync(projectContextSidecarPath(liveSetPath))).toBe(false);
    // A clear must NOT restore the old content back into the param.
    expect(setProjectContext).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no sidecar to clear", async () => {
    const res = await sync({ content: "", allowRestore: false });

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

describe("projectContext.sync — backup (non-empty param)", () => {
  it("writes a sidecar when none exists (first save / Save-As to new folder)", async () => {
    const res = await sync({ content: "Genre: jungle", allowRestore: false });

    expect(res.result).toStrictEqual({ action: "backup" });
    expect(sidecarText()).toBe("Genre: jungle");
  });

  it("overwrites an existing sidecar on a genuine write", async () => {
    seedSidecar("old");

    const res = await sync({
      content: "new",
      allowRestore: false,
      isEdit: true,
    });

    expect(res.result).toStrictEqual({ action: "backup" });
    expect(sidecarText()).toBe("new");
  });

  // One sidecar is shared by every Set in a Live Project folder, so loading an
  // older Set must not push its saved blob over the folder's newer notes. Only
  // a write supersedes an existing backup.
  it("leaves an existing, differing sidecar alone when nothing was written", async () => {
    seedSidecar("newer notes from another Set in this folder");

    const res = await sync({
      content: "stale blob saved in this older .als",
      allowRestore: false,
      isEdit: false,
    });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(sidecarText()).toBe("newer notes from another Set in this folder");
  });

  it("creates a missing sidecar even when nothing was written", async () => {
    const res = await sync({
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: false,
    });

    expect(res.result).toStrictEqual({ action: "backup" });
    expect(sidecarText()).toBe("Genre: jungle");
  });

  it("treats an empty sidecar as no backup, so a passing sync fills it", async () => {
    seedSidecar("   ");

    const res = await sync({
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: false,
    });

    expect(res.result).toStrictEqual({ action: "backup" });
    expect(sidecarText()).toBe("Genre: jungle");
  });

  it("leaves a byte-identical sidecar untouched", async () => {
    seedSidecar("same");

    const res = await sync({ content: "same", allowRestore: false });

    expect(res.result).toStrictEqual({ action: "none" });
  });
});

// Nothing the store does may fail the RPC. V8 only memoizes a completed sync,
// so a failure it can't fix — a read-only volume, a locked cloud-sync folder —
// would be retried on every tool call from then on, appending its warning to
// every tool result.
describe("projectContext.sync — the filesystem refuses", () => {
  it("does not write over a sidecar it couldn't read, even on a genuine write", async () => {
    seedSidecar("newer notes from another Set in this folder");
    vi.mocked(readProjectContextSidecar).mockReturnValueOnce({
      status: "unreadable",
    });

    const res = await sync({
      content: "different notes",
      allowRestore: false,
      isEdit: true,
    });

    expect(res.result).toStrictEqual({ action: "none" });
    expect(writeProjectContextSidecar).not.toHaveBeenCalled();
    expect(sidecarText()).toBe("newer notes from another Set in this folder");
  });

  it("reports none, not a failed request, when the backup write fails", async () => {
    vi.mocked(writeProjectContextSidecar).mockReturnValueOnce(false);

    const res = await sync({ content: "Genre: jungle", allowRestore: false });

    expect(res.success).toBe(true);
    expect(res.result).toStrictEqual({ action: "none" });
  });

  it("reports none, not a failed request, when the clearing delete fails", async () => {
    seedSidecar("Genre: jungle");
    vi.mocked(deleteProjectContextSidecar).mockReturnValueOnce(false);

    const res = await sync({ content: "", allowRestore: false });

    expect(res.success).toBe(true);
    expect(res.result).toStrictEqual({ action: "none" });
  });
});

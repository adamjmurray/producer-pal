// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  installRemoteScript,
  remoteScriptPath,
} from "../remote-script-install.ts";
import { remoteScriptStatus } from "../remote-script-status.ts";
import {
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

const { findUserLibraryPath, setRunningLiveMajor } = vi.hoisted(() => ({
  findUserLibraryPath: vi.fn<() => Promise<string | null>>(),
  setRunningLiveMajor: vi.fn<(major: number | null) => void>(),
}));

// The real lookup reads Live's browser database off the developer's machine.
vi.mock(import("../../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath,
}));

vi.mock(import("../../../live-library/live-db-path.ts"), async (original) => ({
  ...(await original()),
  setRunningLiveMajor,
}));

let scratchDir: string;
let remote: FakeRemoteScript | undefined;

/**
 * Overwrite an installed script's version.py.
 *
 * @param contents - The file's new text
 */
function writeInstalledVersion(contents: string): void {
  writeFileSync(
    join(remoteScriptPath(scratchDir), "version.py"),
    contents,
    "utf8",
  );
}

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "ppal-remote-script-status-"));
  findUserLibraryPath.mockResolvedValue(scratchDir);
});

afterEach(async () => {
  await remote?.close();
  remote = undefined;
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("remoteScriptStatus", () => {
  it("reports nothing installed when the User Library can't be found", async () => {
    findUserLibraryPath.mockResolvedValue(null);

    expect(await remoteScriptStatus()).toStrictEqual({
      userLibrary: null,
      installed: false,
      installedVersion: null,
      bundledVersion: VERSION,
      running: false,
      runningVersion: null,
      liveVersion: null,
      updateAvailable: false,
    });
  });

  it("reports an empty User Library as not installed", async () => {
    const status = await remoteScriptStatus();

    expect(status.userLibrary).toBe(scratchDir);
    expect(status.installed).toBe(false);
    expect(status.updateAvailable).toBe(false);
  });

  it("reports a fresh install as current", async () => {
    installRemoteScript(scratchDir);

    const status = await remoteScriptStatus();

    expect(status.installed).toBe(true);
    expect(status.installedVersion).toBe(VERSION);
    expect(status.updateAvailable).toBe(false);
  });

  it("offers an update when the installed version is older", async () => {
    installRemoteScript(scratchDir);
    writeInstalledVersion('VERSION = "0.0.1"\n');

    const status = await remoteScriptStatus();

    expect(status.installedVersion).toBe("0.0.1");
    expect(status.updateAvailable).toBe(true);
  });

  it("offers an update when the installed version can't be read", async () => {
    installRemoteScript(scratchDir);
    writeInstalledVersion("# someone edited this\n");

    const status = await remoteScriptStatus();

    expect(status.installedVersion).toBeNull();
    expect(status.updateAvailable).toBe(true);
  });

  it("reports the versions a running script answers with", async () => {
    remote = await startFakeRemoteScript(() => ({
      body: { ok: true, live_version: "12.4.5", script_version: "2.0.0" },
    }));

    const status = await remoteScriptStatus();

    expect(status.running).toBe(true);
    expect(status.runningVersion).toBe("2.0.0");
    expect(status.liveVersion).toBe("12.4.5");
  });

  it("records the running Live's major, for picking its browser database", async () => {
    remote = await startFakeRemoteScript(() => ({
      body: { ok: true, live_version: "12.4.5", script_version: "2.0.0" },
    }));

    await remoteScriptStatus();

    expect(setRunningLiveMajor).toHaveBeenCalledWith(12);
  });

  it("keeps the known Live major when nothing answers the ping", async () => {
    await remoteScriptStatus();

    // Clearing it would send the User Library lookup to the newest install's
    // database instead of the running one's.
    expect(setRunningLiveMajor).not.toHaveBeenCalled();
  });

  it("leaves the versions null when a running script omits them", async () => {
    remote = await startFakeRemoteScript(() => ({ body: { ok: true } }));

    const status = await remoteScriptStatus();

    expect(status.running).toBe(true);
    expect(status.runningVersion).toBeNull();
    expect(status.liveVersion).toBeNull();
  });
});

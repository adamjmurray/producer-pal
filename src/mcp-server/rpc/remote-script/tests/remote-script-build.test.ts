// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installRemoteScript } from "../install/remote-script-install.ts";
import {
  BUILD_COMMIT_FILE,
  bundledRemoteScriptBuild,
  installedRemoteScriptBuild,
  remoteScriptBuild,
} from "../bundle/remote-script-build.ts";

// Pinned in remote-script/tests/test_hot_reload.py too, so the device and the
// script agree on what a build ID is.
const FIXTURE_BUILD_HASH =
  "008a3bbe074cb6d740d9baecb1668fda332be74d7b232f5fe6757b7cf20147d9";

const FIXTURE: Record<string, string> = {
  "a.py": "x = 1\n",
  "b.py": "y = 2\n",
  // Bootstrap files count; other extensions, dot-files and subfolders don't.
  "bridge.py": "z = 3\n",
  "notes.txt": "ignored\n",
  ".hidden.py": "h = 1\n",
  "sub/c.py": "c = 1\n",
};

let userLibrary: string;

beforeEach(() => {
  userLibrary = mkdtempSync(join(tmpdir(), "ppal-script-build-"));
});

afterEach(() => {
  rmSync(userLibrary, { recursive: true, force: true });
});

describe("remoteScriptBuild", () => {
  it("matches the hash hot_reload.py gives the same files", () => {
    expect(remoteScriptBuild(FIXTURE)).toBe(FIXTURE_BUILD_HASH);
  });

  it("changes when a bootstrap file does", () => {
    expect(remoteScriptBuild({ ...FIXTURE, "bridge.py": "z = 4\n" })).not.toBe(
      FIXTURE_BUILD_HASH,
    );
  });
});

describe("installedRemoteScriptBuild", () => {
  it("is the bundled build right after an install", () => {
    const { path } = installRemoteScript(userLibrary);

    expect(installedRemoteScriptBuild(path)).toBe(bundledRemoteScriptBuild());
  });

  it("ignores the commit file and anything that isn't a top-level .py file", () => {
    const { path } = installRemoteScript(userLibrary);

    writeFileSync(join(path, BUILD_COMMIT_FILE), "abc1234\n");
    writeFileSync(join(path, "notes.txt"), "x");

    expect(installedRemoteScriptBuild(path)).toBe(bundledRemoteScriptBuild());
  });

  it("differs once an installed file changes", () => {
    const { path } = installRemoteScript(userLibrary);

    appendFileSync(join(path, "http_server.py"), "# edited\n");

    expect(installedRemoteScriptBuild(path)).not.toBe(
      bundledRemoteScriptBuild(),
    );
  });

  it("is null for a folder that can't be read", () => {
    expect(installedRemoteScriptBuild(join(userLibrary, "missing"))).toBeNull();
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDED_REMOTE_SCRIPT_FILES } from "../embedded-remote-script.ts";
import {
  RemoteScriptInstallError,
  installRemoteScript,
  remoteScriptPath,
} from "../remote-script-install.ts";
import { readRemoteScriptSource } from "../remote-script-source.ts";

const { homedir } = vi.hoisted(() => ({ homedir: vi.fn<() => string>() }));

// The install expands "~", and a test can't write to the real home folder.
vi.mock(import("node:os"), async (importOriginal) => ({
  ...(await importOriginal()),
  homedir,
}));

let scratchDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "ppal-remote-script-"));
  homedir.mockReturnValue(scratchDir);
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("readRemoteScriptSource", () => {
  it("reads files at any depth and leaves bytecode out", () => {
    mkdirSync(join(scratchDir, "__pycache__"));
    mkdirSync(join(scratchDir, "nested"));
    writeFileSync(join(scratchDir, "__init__.py"), "top", "utf8");
    writeFileSync(join(scratchDir, "stale.pyc"), "bytecode", "utf8");
    writeFileSync(join(scratchDir, "__pycache__/a.pyc"), "bytecode", "utf8");
    writeFileSync(join(scratchDir, "nested/deep.py"), "deep", "utf8");

    expect(readRemoteScriptSource(scratchDir)).toStrictEqual({
      "__init__.py": "top",
      "nested/deep.py": "deep",
    });
  });
});

describe("the embedded script", () => {
  it("carries the modules Live loads, and a version", () => {
    expect(Object.keys(EMBEDDED_REMOTE_SCRIPT_FILES)).toStrictEqual(
      expect.arrayContaining([
        "__init__.py",
        "bridge.py",
        "routes.py",
        "version.py",
      ]),
    );
  });
});

describe("installRemoteScript", () => {
  it("writes every embedded file into Remote Scripts/Producer_Pal", () => {
    const { path } = installRemoteScript(scratchDir);

    expect(path).toBe(remoteScriptPath(scratchDir));

    for (const [relative, contents] of Object.entries(
      EMBEDDED_REMOTE_SCRIPT_FILES,
    )) {
      expect(readFileSync(join(path, relative), "utf8")).toBe(contents);
    }
  });

  it("replaces the folder, so a removed module doesn't linger", () => {
    const { path } = installRemoteScript(scratchDir);

    writeFileSync(join(path, "gone_next_time.py"), "stale", "utf8");
    installRemoteScript(scratchDir);

    expect(existsSync(join(path, "gone_next_time.py"))).toBe(false);
    expect(existsSync(join(path, "__init__.py"))).toBe(true);
  });

  it("refuses a folder that isn't there", () => {
    expect(() => installRemoteScript(join(scratchDir, "nope"))).toThrow(
      RemoteScriptInstallError,
    );
  });

  it("refuses a file", () => {
    const file = join(scratchDir, "not-a-folder");

    writeFileSync(file, "", "utf8");

    expect(() => installRemoteScript(file)).toThrow("Not a folder");
  });

  it("refuses a relative path", () => {
    expect(() => installRemoteScript("User Library")).toThrow(
      "Not an absolute path",
    );
  });

  it("expands a leading ~ to the home folder", () => {
    mkdirSync(join(scratchDir, "Ableton"));

    expect(installRemoteScript("~/Ableton").path).toBe(
      remoteScriptPath(join(scratchDir, "Ableton")),
    );
    expect(installRemoteScript("~").path).toBe(remoteScriptPath(scratchDir));
  });

  it("keeps the working install when the new copy can't be written", () => {
    const { path } = installRemoteScript(scratchDir);
    const parent = join(scratchDir, "Remote Scripts");

    writeFileSync(join(path, "marker.py"), "old install", "utf8");
    // Read-only parent: the temp folder can't be created, so the install fails
    // before anything is deleted.
    chmodSync(parent, 0o500);

    expect(() => installRemoteScript(scratchDir)).toThrow(
      /EACCES|EPERM|ENOTEMPTY/,
    );

    chmodSync(parent, 0o700);

    expect(readFileSync(join(path, "marker.py"), "utf8")).toBe("old install");
    expect(existsSync(join(path, "__init__.py"))).toBe(true);
  });

  it("leaves no temp folder behind when the swap fails", () => {
    const { path } = installRemoteScript(scratchDir);
    const temp = `${path}.tmp-${process.pid}`;

    writeFileSync(join(path, "marker.py"), "old install", "utf8");
    // A read-only install folder can't be emptied, so the new copy is written
    // but the swap fails.
    chmodSync(path, 0o500);

    expect(() => installRemoteScript(scratchDir)).toThrow(
      /EACCES|EPERM|ENOTEMPTY/,
    );

    chmodSync(path, 0o700);

    expect(existsSync(temp)).toBe(false);
    expect(readFileSync(join(path, "marker.py"), "utf8")).toBe("old install");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type PathLike,
  type RmOptions,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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
// Path prefixes whose fs calls should fail.
const fault = vi.hoisted(() => ({
  renameFrom: [] as string[],
  rm: [] as string[],
  readdir: false,
}));

// The install expands "~", and a test can't write to the real home folder.
vi.mock(import("node:os"), async (importOriginal) => ({
  ...(await importOriginal()),
  homedir,
}));

// Lets a test fail chosen fs calls, which no real folder setup does reliably
// (permissions don't stop root).
vi.mock(import("node:fs"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    renameSync: (from: PathLike, to: PathLike) => {
      if (fault.renameFrom.some((prefix) => String(from).startsWith(prefix))) {
        throw new Error(`EPERM: rename ${String(from)}`);
      }

      actual.renameSync(from, to);
    },
    readdirSync: ((...args: Parameters<typeof actual.readdirSync>) => {
      if (fault.readdir) {
        throw new Error("EACCES: readdir");
      }

      return actual.readdirSync(...args);
    }) as typeof actual.readdirSync,
    rmSync: (path: PathLike, options?: RmOptions) => {
      const faulty = fault.rm.some((prefix) => String(path).startsWith(prefix));

      if (faulty && actual.existsSync(path)) {
        throw new Error(`EBUSY: rm ${String(path)}`);
      }

      actual.rmSync(path, options);
    },
  };
});

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

let scratchDir: string;

beforeEach(() => {
  fault.renameFrom = [];
  fault.rm = [];
  fault.readdir = false;
  scratchDir = mkdtempSync(join(tmpdir(), "ppal-remote-script-"));
  homedir.mockReturnValue(scratchDir);
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("readRemoteScriptSource", () => {
  it("reads .py files at any depth and leaves everything else out", () => {
    mkdirSync(join(scratchDir, "__pycache__"));
    mkdirSync(join(scratchDir, "nested"));
    writeFileSync(join(scratchDir, "__init__.py"), "top", "utf8");
    writeFileSync(join(scratchDir, ".DS_Store"), "finder", "utf8");
    writeFileSync(join(scratchDir, "nested/notes.txt"), "scratch", "utf8");
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
    expect(readdirSync(join(scratchDir, "Remote Scripts"))).toStrictEqual([
      "Producer_Pal",
    ]);
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

  it("restores the working install when the new copy can't be moved in", () => {
    const { path } = installRemoteScript(scratchDir);

    writeFileSync(join(path, "marker.py"), "old install", "utf8");
    fault.renameFrom = [`${path}.tmp-`];

    expect(() => installRemoteScript(scratchDir)).toThrow("EPERM");
    expect(readFileSync(join(path, "marker.py"), "utf8")).toBe("old install");
    expect(readdirSync(join(scratchDir, "Remote Scripts"))).toStrictEqual([
      "Producer_Pal",
    ]);
  });

  it("reports the first failure and where the old install is when it can't be put back", () => {
    const { path } = installRemoteScript(scratchDir);

    writeFileSync(join(path, "marker.py"), "old install", "utf8");
    fault.renameFrom = [`${path}.tmp-`, `${path}.old-`];

    expect(() => installRemoteScript(scratchDir)).toThrow(
      /^EPERM: rename .*Producer_Pal\.tmp-.*old install left at .*Producer_Pal\.old-/,
    );

    const backup = readdirSync(join(scratchDir, "Remote Scripts")).find(
      (name) => name.startsWith("Producer_Pal.old-"),
    );

    expect(
      readFileSync(
        join(scratchDir, "Remote Scripts", `${backup}`, "marker.py"),
        "utf8",
      ),
    ).toBe("old install");
  });

  it("keeps installing when old installs can't be cleaned up", () => {
    const { path } = installRemoteScript(scratchDir);

    writeFileSync(join(path, "marker.py"), "old install", "utf8");
    fault.rm = [`${path}.old-`];

    expect(installRemoteScript(scratchDir).path).toBe(path);
    expect(installRemoteScript(scratchDir).path).toBe(path);
    expect(existsSync(join(path, "marker.py"))).toBe(false);
    expect(existsSync(join(path, "__init__.py"))).toBe(true);
  });

  it("clears only its own leftovers, whatever process made them", () => {
    const scripts = join(scratchDir, "Remote Scripts");
    const ours = [`tmp-${UUID}`, `old-${UUID}`].map((s) => `Producer_Pal.${s}`);

    installRemoteScript(scratchDir);

    for (const name of [...ours, "Producer_Pal.old-mybackup", "Other"]) {
      mkdirSync(join(scripts, name));
    }

    installRemoteScript(scratchDir);

    expect(readdirSync(scripts).toSorted()).toStrictEqual([
      "Other",
      "Producer_Pal",
      "Producer_Pal.old-mybackup",
    ]);
  });

  it("keeps a backup when there's no install, since it may be the only copy", () => {
    const scripts = join(scratchDir, "Remote Scripts");
    const backup = join(scripts, `Producer_Pal.old-${UUID}`);

    mkdirSync(backup, { recursive: true });
    installRemoteScript(scratchDir);

    expect(existsSync(backup)).toBe(true);
  });

  it("replaces a broken link at the script folder", () => {
    const path = remoteScriptPath(scratchDir);

    mkdirSync(join(scratchDir, "Remote Scripts"));
    symlinkSync(join(scratchDir, "gone"), path);

    expect(installRemoteScript(scratchDir).path).toBe(path);
    expect(existsSync(join(path, "__init__.py"))).toBe(true);
  });

  it("installs when the Remote Scripts folder can't be listed", () => {
    installRemoteScript(scratchDir);
    fault.readdir = true;

    const { path } = installRemoteScript(scratchDir);

    fault.readdir = false;

    expect(existsSync(join(path, "__init__.py"))).toBe(true);
  });
});

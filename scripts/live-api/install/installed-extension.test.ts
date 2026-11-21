// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type PathLike,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findInstalledExtensionId,
  installedExtensionDir,
  replaceFolder,
  writeJsonViaTemp,
} from "./installed-extension.ts";

// Lets a test fail chosen renames and removals, which no real folder setup
// does reliably (permissions don't stop root).
const fault = vi.hoisted(() => ({
  rename: null as ((from: string, to: string) => boolean) | null,
  remove: null as ((path: string) => boolean) | null,
}));

vi.mock(import("node:fs"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    renameSync: (from: PathLike, to: PathLike) => {
      if (fault.rename?.(String(from), String(to)) === true) {
        throw new Error(`EPERM: rename ${String(from)}`);
      }

      actual.renameSync(from, to);
    },
    rmSync: (path: PathLike, options?: Parameters<typeof actual.rmSync>[1]) => {
      if (fault.remove?.(String(path)) === true) {
        throw new Error(`EBUSY: remove ${String(path)}`);
      }

      actual.rmSync(path, options);
    },
  };
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "installed-extension-test-"));
});

afterEach(() => {
  fault.rename = null;
  fault.remove = null;
  rmSync(root, { recursive: true, force: true });
});

/**
 * @param dir - Folder to make
 * @param content - What its one file holds
 * @returns The folder
 */
function folderWith(dir: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), content);

  return dir;
}

describe("findInstalledExtensionId", () => {
  it("finds the id by manifest name", () => {
    const installations = {
      extensions: {
        other: { manifest: { name: "other" } },
        "local.dxt.me.producer-pal": { manifest: { name: "producer-pal" } },
      },
    };

    expect(findInstalledExtensionId(installations, "producer-pal")).toBe(
      "local.dxt.me.producer-pal",
    );
  });

  it("finds nothing when no extension has the name", () => {
    expect(
      findInstalledExtensionId(
        { extensions: { a: { manifest: { name: "a" } } } },
        "b",
      ),
    ).toBeUndefined();
  });

  it("skips an entry with no manifest or no entry at all", () => {
    const installations = {
      extensions: {
        broken: { version: "1.0.0" },
        gone: undefined,
        ours: { manifest: { name: "producer-pal" } },
      },
    };

    expect(findInstalledExtensionId(installations, "producer-pal")).toBe(
      "ours",
    );
  });

  it("finds nothing when there is no extensions record", () => {
    expect(findInstalledExtensionId({}, "producer-pal")).toBeUndefined();
  });
});

describe("installedExtensionDir", () => {
  it("is the id's folder under Claude Extensions", () => {
    expect(installedExtensionDir(root, "local.dxt.me.producer-pal")).toBe(
      join(root, "Claude Extensions", "local.dxt.me.producer-pal"),
    );
  });

  it.each(["..", ".", "", "../x", "a/b", "a/../..", "/etc"])(
    "refuses the id %j, which isn't a folder directly under it",
    (id) => {
      expect(() => installedExtensionDir(root, id)).toThrow(
        "isn't a folder directly under",
      );
    },
  );
});

describe("replaceFolder", () => {
  /** @returns The files in the folder that holds the target */
  function siblings(): string[] {
    return readdirSync(join(root, "ext")).toSorted();
  }

  /** The target folder, with old contents. */
  function target(): string {
    return join(root, "ext", "installed");
  }

  /** @returns A source folder with new contents */
  function source(): string {
    return join(root, "new");
  }

  beforeEach(() => {
    folderWith(target(), "old");
    folderWith(source(), "new");
  });

  it("puts the copy in place, runs the callback and leaves nothing beside it", () => {
    let seen = "";

    replaceFolder(target(), source(), () => {
      seen = readFileSync(join(target(), "manifest.json"), "utf8");
    });

    expect(seen).toBe("new");
    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("new");
    expect(siblings()).toStrictEqual(["installed"]);
  });

  it("returns nothing when the old folder was deleted", () => {
    expect(replaceFolder(target(), source(), () => undefined)).toBeUndefined();
  });

  it("puts the old folder back when moving the copy in fails", () => {
    fault.rename = (from) => from.includes(".tmp-");

    expect(() => replaceFolder(target(), source(), () => undefined)).toThrow(
      "EPERM",
    );

    fault.rename = null;
    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("old");
    expect(siblings()).toStrictEqual(["installed"]);
  });

  it("says where the old folder is, with the cause, when it can't be put back", () => {
    fault.rename = (from) => from.includes(".tmp-") || from.includes(".old-");

    let thrown: unknown;

    try {
      replaceFolder(target(), source(), () => undefined);
    } catch (error) {
      thrown = error;
    }

    fault.rename = null;

    const backup = siblings().find((name) => name.includes(".old-"));

    expect(backup).toBeDefined();
    expect((thrown as Error).message).toContain(
      "the old copy couldn't be put back",
    );
    expect((thrown as Error).message).toContain(join(root, "ext", backup!));
    expect(((thrown as Error).cause as Error).message).toContain(
      "EPERM: rename",
    );
    // The copy is cleaned up even though the restore failed.
    expect(siblings().filter((name) => name.includes(".tmp-"))).toStrictEqual(
      [],
    );
    expect(
      readFileSync(join(root, "ext", backup!, "manifest.json"), "utf8"),
    ).toBe("old");
  });

  it("still throws the original error when removing the copy fails too", () => {
    fault.rename = (from) => from.includes(".tmp-");
    fault.remove = (path) => path.includes(".tmp-");

    expect(() => replaceFolder(target(), source(), () => undefined)).toThrow(
      "EPERM",
    );

    fault.rename = null;
    fault.remove = null;
    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("old");
  });

  it("reports the old folder's path instead of failing when it can't be deleted", () => {
    fault.remove = (path) => path.includes(".old-");

    const leftover = replaceFolder(target(), source(), () => undefined);

    fault.remove = null;
    expect(leftover).toContain(".old-");
    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("new");
    expect(readFileSync(join(leftover!, "manifest.json"), "utf8")).toBe("old");
  });

  it("installs when nothing was there", () => {
    rmSync(target(), { recursive: true });

    replaceFolder(target(), source(), () => undefined);

    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("new");
    expect(siblings()).toStrictEqual(["installed"]);
  });

  it("keeps the old folder when the copy fails", () => {
    rmSync(source(), { recursive: true });

    expect(() => replaceFolder(target(), source(), () => undefined)).toThrow(
      "ENOENT",
    );

    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("old");
    expect(siblings()).toStrictEqual(["installed"]);
  });

  it("puts the old folder back when the callback fails", () => {
    expect(() =>
      replaceFolder(target(), source(), () => {
        throw new Error("record not written");
      }),
    ).toThrow("record not written");

    expect(readFileSync(join(target(), "manifest.json"), "utf8")).toBe("old");
    expect(siblings()).toStrictEqual(["installed"]);
  });

  it("removes the copy and leaves nothing when it fails with no old folder", () => {
    rmSync(target(), { recursive: true });

    expect(() =>
      replaceFolder(target(), source(), () => {
        throw new Error("record not written");
      }),
    ).toThrow("record not written");

    expect(existsSync(target())).toBe(false);
    expect(siblings()).toStrictEqual([]);
  });
});

describe("writeJsonViaTemp", () => {
  it("writes the file as JSON and leaves nothing beside it", () => {
    const file = join(root, "installations.json");

    writeJsonViaTemp(file, { extensions: {} });

    expect(JSON.parse(readFileSync(file, "utf8"))).toStrictEqual({
      extensions: {},
    });
    expect(readdirSync(root)).toStrictEqual(["installations.json"]);
  });

  it("keeps the old file and removes the temp when the rename fails", () => {
    const file = join(root, "installations.json");

    writeFileSync(file, "old");
    fault.rename = () => true;

    expect(() => writeJsonViaTemp(file, { a: 1 })).toThrow("EPERM");

    fault.rename = null;
    expect(readFileSync(file, "utf8")).toBe("old");
    expect(readdirSync(root)).toStrictEqual(["installations.json"]);
  });
});

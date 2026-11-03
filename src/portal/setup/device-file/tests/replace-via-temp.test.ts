// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isInUseFailure,
  removeStaleTempFiles,
  replaceViaTemp,
} from "../replace-via-temp.ts";
import { makeScratchLibrary } from "../../tests/device-test-helpers.ts";

let folder: string;

beforeEach(() => {
  folder = makeScratchLibrary();
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("replaceViaTemp", () => {
  it("writes the file, making its folder, and leaves no temp file", () => {
    const path = join(folder, "a/b/file.bin");

    expect(
      replaceViaTemp(path, (temp) => writeFileSync(temp, "new")),
    ).toBeUndefined();
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(readdirSync(join(folder, "a/b"))).toStrictEqual(["file.bin"]);
  });

  it("keeps the old file when the write fails, and removes the temp file", () => {
    const path = join(folder, "file.bin");

    writeFileSync(path, "old");

    const failure = replaceViaTemp(path, (temp) => {
      writeFileSync(temp, "half");
      throw new Error("disk full");
    });

    expect(failure?.renaming).toBe(false);
    expect(failure?.error).toStrictEqual(new Error("disk full"));
    expect(failure?.tempFileLeft).toBeUndefined();
    expect(readFileSync(path, "utf8")).toBe("old");
    expect(readdirSync(folder)).toStrictEqual(["file.bin"]);
  });

  it("says the failure was in the rename when a folder is in the way", () => {
    const path = join(folder, "file.bin");

    mkdirSync(join(path, "inside"), { recursive: true });

    const failure = replaceViaTemp(path, (temp) => writeFileSync(temp, "new"));

    expect(failure?.renaming).toBe(true);
    expect(failure?.tempFileLeft).toBeUndefined();
  });
});

describe("isInUseFailure", () => {
  const coded = (code: string): Error =>
    Object.assign(new Error(code), { code });

  it.each(["EPERM", "EBUSY", "EACCES"])(
    "is true for %s while renaming",
    (code) => {
      expect(isInUseFailure({ error: coded(code), renaming: true })).toBe(true);
    },
  );

  it("is false before the rename, for other codes, and for non-errors", () => {
    expect(isInUseFailure({ error: coded("EPERM"), renaming: false })).toBe(
      false,
    );
    expect(isInUseFailure({ error: coded("ENOSPC"), renaming: true })).toBe(
      false,
    );
    expect(isInUseFailure({ error: undefined, renaming: true })).toBe(false);
  });
});

describe("removeStaleTempFiles", () => {
  const UUID = "11111111-2222-3333-4444-555555555555";

  it("removes old temp files of that file name only", () => {
    const stale = join(folder, `my file.amxd.tmp-${UUID}`);
    const young = join(
      folder,
      `my file.amxd.tmp-aaaaaaaa-2222-3333-4444-555555555555`,
    );
    const other = join(folder, `other.amxd.tmp-${UUID}`);
    const users = join(folder, "my file.amxd.tmp-notes");
    const longAgo = new Date(Date.now() - 3_600_000);

    for (const path of [stale, young, other, users]) {
      writeFileSync(path, "x");
    }

    for (const path of [stale, other, users]) {
      utimesSync(path, longAgo, longAgo);
    }

    removeStaleTempFiles(folder, "my file.amxd");

    expect(existsSync(stale)).toBe(false);
    expect(existsSync(young)).toBe(true);
    expect(existsSync(other)).toBe(true);
    expect(existsSync(users)).toBe(true);
  });

  it("does nothing for a folder that isn't there", () => {
    expect(() =>
      removeStaleTempFiles(join(folder, "nope"), "x.amxd"),
    ).not.toThrow();
  });
});

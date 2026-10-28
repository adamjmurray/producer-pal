// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InstallLibraryError,
  resolveInstallLibrary,
} from "./install-library.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "install-library-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveInstallLibrary", () => {
  it("prefers ABLETON_USER_LIBRARY over a found library", async () => {
    const find = () => Promise.reject(new Error("should not be asked"));

    await expect(resolveInstallLibrary(dir, find)).resolves.toStrictEqual({
      path: dir,
      source: "ABLETON_USER_LIBRARY",
    });
  });

  it("does not fall back when ABLETON_USER_LIBRARY is bad", async () => {
    const find = () => Promise.resolve(dir);

    await expect(
      resolveInstallLibrary(join(dir, "missing"), find),
    ).rejects.toThrow(/^ABLETON_USER_LIBRARY: Not a folder/);
    await expect(resolveInstallLibrary("relative/path", find)).rejects.toThrow(
      /Not an absolute path/,
    );
  });

  it("finds the library when the variable is unset or empty", async () => {
    const find = () => Promise.resolve(dir);
    const expected = { path: dir, source: "found" };

    await expect(resolveInstallLibrary(undefined, find)).resolves.toStrictEqual(
      expected,
    );
    await expect(resolveInstallLibrary("", find)).resolves.toStrictEqual(
      expected,
    );
  });

  it("tells the user to set ABLETON_USER_LIBRARY when nothing is found", async () => {
    const error = await resolveInstallLibrary(undefined, () =>
      Promise.resolve(null),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InstallLibraryError);
    expect((error as Error).message).toMatch(/Set ABLETON_USER_LIBRARY/);
  });
});

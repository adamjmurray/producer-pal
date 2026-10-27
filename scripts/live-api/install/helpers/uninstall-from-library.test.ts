// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type UninstallOptions,
  describeUninstall,
  uninstallFromLibrary,
} from "./uninstall-from-library.ts";

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let library: string;

const DEVICE = () =>
  join(library, "Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd");
const COPY = () => join(library, "Presets/Mine/Producer_Pal 2.amxd");
const SCRIPT = () => join(library, "Remote Scripts/Producer_Pal");
const TEMP = () => `${SCRIPT()}.tmp-${UUID_A}`;
const OLD = () => `${SCRIPT()}.old-${UUID_B}`;
const OTHER_SCRIPT = () => join(library, "Remote Scripts/Mine");

function touch(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "x");
}

/** A library with everything Producer Pal can leave in it. */
function fillLibrary(): void {
  for (const path of [DEVICE(), COPY()]) {
    touch(path);
  }

  for (const path of [SCRIPT(), TEMP(), OLD(), OTHER_SCRIPT()]) {
    touch(join(path, "__init__.py"));
  }
}

function options(overrides: Partial<UninstallOptions>): UninstallOptions {
  return {
    device: false,
    remoteScript: false,
    otherCopies: false,
    ...overrides,
  };
}

beforeEach(() => {
  library = mkdtempSync(join(tmpdir(), "uninstall-library-"));
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

describe("uninstallFromLibrary", () => {
  it("--device removes only the installed device and keeps other copies", () => {
    fillLibrary();

    const result = uninstallFromLibrary(library, options({ device: true }));

    expect(result.removed).toStrictEqual([DEVICE()]);
    expect(result.keptCopies).toStrictEqual([COPY()]);
    expect(existsSync(DEVICE())).toBe(false);
    expect(existsSync(COPY())).toBe(true);
    expect(existsSync(SCRIPT())).toBe(true);
  });

  it("--device --other-copies removes the copies too", () => {
    fillLibrary();

    const result = uninstallFromLibrary(
      library,
      options({ device: true, otherCopies: true }),
    );

    expect(result.removed).toStrictEqual([DEVICE(), COPY()]);
    expect(result.keptCopies).toStrictEqual([]);
    expect(existsSync(SCRIPT())).toBe(true);
  });

  it("--remote-script removes the script and its temp and backup folders only", () => {
    fillLibrary();

    const result = uninstallFromLibrary(
      library,
      options({ remoteScript: true }),
    );

    expect(result.removed).toStrictEqual([SCRIPT(), OLD(), TEMP()]);
    expect(result.removedRemoteScript).toBe(true);
    expect(existsSync(OTHER_SCRIPT())).toBe(true);
    expect(existsSync(DEVICE())).toBe(true);
    expect(existsSync(COPY())).toBe(true);
  });

  it("removes leftovers even when the script itself isn't installed", () => {
    touch(join(TEMP(), "x.py"));

    const result = uninstallFromLibrary(
      library,
      options({ remoteScript: true }),
    );

    expect(result.removed).toStrictEqual([TEMP()]);
    expect(result.absent).toStrictEqual([SCRIPT()]);
  });

  it("device and remote script together leave other copies and say so", () => {
    fillLibrary();

    const opts = options({ device: true, remoteScript: true });
    const result = uninstallFromLibrary(library, opts);

    expect(result.removed).toHaveLength(4);
    expect(result.keptCopies).toStrictEqual([COPY()]);

    const { out } = describeUninstall(result, opts);

    expect(out.join("\n")).toContain(
      "WARNING: 1 other Producer_Pal .amxd copy",
    );
    expect(out.join("\n")).toContain("npm run uninstall:all");
  });

  it("says plainly when there is nothing to remove", () => {
    const opts = options({ device: true, remoteScript: true });
    const result = uninstallFromLibrary(library, opts);
    const { out, err } = describeUninstall(result, opts);

    expect(result.removed).toStrictEqual([]);
    expect(out).toStrictEqual([
      `Nothing to remove at ${DEVICE()}`,
      `Nothing to remove at ${SCRIPT()}`,
    ]);
    expect(err).toStrictEqual([]);
  });

  it("reminds about the Control Surface only when the script was removed", () => {
    fillLibrary();

    const withScript = options({ remoteScript: true });
    const reminder = /Control Surface slot to None/;

    expect(
      describeUninstall(
        uninstallFromLibrary(library, withScript),
        withScript,
      ).out.join("\n"),
    ).toMatch(reminder);

    const deviceOnly = options({ device: true });

    expect(
      describeUninstall(
        uninstallFromLibrary(library, deviceOnly),
        deviceOnly,
      ).out.join("\n"),
    ).not.toMatch(reminder);
  });

  it("keeps going when one deletion fails, and reports both sides", () => {
    fillLibrary();

    const opts = options({ device: true, remoteScript: true });
    const deleted: string[] = [];
    const result = uninstallFromLibrary(library, opts, (path) => {
      if (path === SCRIPT()) {
        throw new Error("EPERM: locked");
      }

      deleted.push(path);
    });

    expect(deleted).toStrictEqual([DEVICE(), OLD(), TEMP()]);
    expect(result.removed).toStrictEqual(deleted);
    expect(result.failed).toStrictEqual([
      { path: SCRIPT(), error: "EPERM: locked" },
    ]);

    const { out, err } = describeUninstall(result, opts);

    expect(out).toContain(`Removed ${DEVICE()}`);
    expect(err).toStrictEqual([`Failed to remove ${SCRIPT()}: EPERM: locked`]);
  });
});

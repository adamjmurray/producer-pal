// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { deviceFilePath } from "../device-file-status.ts";
import { installDevice } from "../device-install.ts";
import { fakeDevice, makeScratchLibrary, put } from "./device-test-helpers.ts";

// Each names a user-library-fs call to fail, by a path prefix or substring.
const fault = vi.hoisted(() => ({
  // Error code to fail the copy with, after leaving a partial temp file.
  copy: undefined as string | undefined,
  chmod: false,
  rename: undefined as string | undefined,
  mkdir: false,
  // Fail deleting a path containing this text.
  remove: undefined as string | undefined,
  // Make a folder, then throw, as a failed recursive mkdir can.
  mkdirPartial: undefined as string | undefined,
}));

vi.mock(
  import("#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      copyIntoLibrary: (from, to) => {
        if (fault.copy != null) {
          actual.copyIntoLibrary(from, to);
          throw Object.assign(new Error(`${fault.copy}: copy`), {
            code: fault.copy,
          });
        }

        actual.copyIntoLibrary(from, to);
      },
      setLibraryFileMode: (file, mode) => {
        if (fault.chmod) {
          throw new Error("EPERM: chmod");
        }

        actual.setLibraryFileMode(file, mode);
      },
      renameInLibrary: (from, to) => {
        if (fault.rename != null) {
          throw Object.assign(new Error(`${fault.rename}: rename`), {
            code: fault.rename,
          });
        }

        actual.renameInLibrary(from, to);
      },
      makeLibraryFolder: (folder) => {
        if (fault.mkdirPartial != null) {
          actual.makeLibraryFolder(fault.mkdirPartial);
          throw new Error("EIO: mkdir");
        }

        if (fault.mkdir) {
          throw new Error("EACCES: mkdir");
        }

        actual.makeLibraryFolder(folder);
      },
      removeFromLibrary: (path) => {
        if (fault.remove != null && path.includes(fault.remove)) {
          throw new Error("EBUSY: rm");
        }

        actual.removeFromLibrary(path);
      },
    };
  },
);

let library: string;
let source: string;

beforeEach(() => {
  fault.copy = undefined;
  fault.chmod = false;
  fault.rename = undefined;
  fault.mkdir = false;
  fault.remove = undefined;
  fault.mkdirPartial = undefined;
  library = makeScratchLibrary();
  source = join(library, "bundled.amxd");
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

const device = (): string => deviceFilePath(library);
const folderNames = (): string[] => readdirSync(dirname(device()));

describe("installDevice", () => {
  it("installs into a library with no Presets folder, and reports the folders it made", () => {
    put(source, fakeDevice("2.4.0"));

    const result = installDevice(library, source);

    expect(result).toStrictEqual({
      outcome: "installed",
      path: device(),
      detail: "Installed the device.",
      changed: true,
      createdFolders: [
        join(library, "Presets"),
        join(library, "Presets", "MIDI Effects"),
        join(library, "Presets", "MIDI Effects", "Max MIDI Effect"),
      ],
      previousVersion: undefined,
      bundledVersion: "2.4.0",
      otherCopies: [],
    });
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
    expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
  });

  it("makes only the folders that are missing", () => {
    put(source, fakeDevice("2.4.0"));
    put(join(library, "Presets/MIDI Effects/Max MIDI Effect/Other.amxd"), "x");

    expect(installDevice(library, source).createdFolders).toStrictEqual([]);
  });

  it("replaces an older device", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({
        outcome: "updated",
        changed: true,
        previousVersion: "2.4.0",
        bundledVersion: "2.4.1",
      }),
    );
    expect(result.detail).toContain("reopened");
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.1"));
    expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
  });

  it("does nothing when the device is already current", () => {
    put(source, fakeDevice("2.4.0"));
    put(device(), fakeDevice("2.4.0"));

    expect(installDevice(library, source)).toStrictEqual(
      expect.objectContaining({
        outcome: "current",
        changed: false,
        createdFolders: [],
      }),
    );
  });

  it("keeps a newer device unless forced", () => {
    put(source, fakeDevice("2.4.0"));
    put(device(), fakeDevice("2.5.0"));

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({ outcome: "skipped", changed: false }),
    );
    expect(result.detail).toContain("newer");
    expect(result.detail).toContain("force");
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.5.0"));
  });

  it("replaces a newer device when forced", () => {
    put(source, fakeDevice("2.4.0"));
    put(device(), fakeDevice("2.5.0"));

    expect(installDevice(library, source, { force: true })).toStrictEqual(
      expect.objectContaining({
        outcome: "updated",
        changed: true,
      }),
    );
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
  });

  it("keeps a file it can't place by version unless forced", () => {
    put(source, fakeDevice("2.4.0"));
    put(device(), "someone's own file");

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({ outcome: "skipped", changed: false }),
    );
    expect(result.detail).toContain("names no version");
    expect(readFileSync(device(), "utf8")).toBe("someone's own file");
    expect(installDevice(library, source, { force: true }).outcome).toBe(
      "updated",
    );
  });

  it("reports other copies and leaves them alone", () => {
    const other = join(library, "Presets/Instruments/Producer_Pal.amxd");

    put(source, fakeDevice("2.4.0"));
    put(other, "x");

    expect(installDevice(library, source).otherCopies).toStrictEqual([other]);
    expect(existsSync(other)).toBe(true);
  });

  it.each([
    ["2.5.0-rc1", "2.5.0-rc2"],
    ["2.5.0-rc2", "2.5.0-rc1"],
  ])(
    "keeps installed %s when the bundled one is %s, and says their order can't be told",
    (installed, bundled) => {
      put(source, fakeDevice(bundled));
      put(device(), fakeDevice(installed));

      const result = installDevice(library, source);

      expect(result.outcome).toBe("skipped");
      expect(result.detail).toBe(
        `The installed device (${installed}) and the bundled one (${bundled}) differ, and their order can't be told. Left unchanged. Use force to replace it.`,
      );
      expect(readFileSync(device())).toStrictEqual(fakeDevice(installed));
    },
  );

  it("installs a writable file even when the bundled one is read-only", () => {
    put(source, fakeDevice("2.4.0"));
    chmodSync(source, 0o444);

    installDevice(library, source);

    expect(statSync(device()).mode & 0o777).toBe(0o644);
  });

  it("removes old temp files that an earlier crash left behind", () => {
    const stale = `${device()}.tmp-0f8fad5b-d9cb-469f-a165-70867728950e`;
    const notOurs = `${device()}.tmp-mine`;
    const longAgo = new Date(Date.now() - 120_000);

    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    put(stale, "x");
    put(notOurs, "x");
    utimesSync(stale, longAgo, longAgo);
    utimesSync(notOurs, longAgo, longAgo);

    installDevice(library, source);

    expect(existsSync(stale)).toBe(false);
    expect(existsSync(notOurs)).toBe(true);
  });

  it("leaves a recent temp file alone, since another install may be writing it", () => {
    const recent = `${device()}.tmp-0f8fad5b-d9cb-469f-a165-70867728950e`;

    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    put(recent, "x");

    installDevice(library, source);

    expect(existsSync(recent)).toBe(true);
  });

  it("refuses a User Library that isn't a folder, before changing anything", () => {
    put(source, fakeDevice("2.4.0"));

    expect(() => installDevice(join(library, "nope"), source)).toThrow(
      UserLibraryFolderError,
    );
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });

  it("throws, before changing anything, when the bundled device is missing", () => {
    expect(() => installDevice(library, source)).toThrow(
      "The bundled device can't be read",
    );
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });
});

describe("installDevice when a step fails after the filesystem changed", () => {
  it("keeps the old file and removes the temp file when the rename fails", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    fault.rename = "EIO";

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({
        outcome: "failed",
        changed: false,
        createdFolders: [],
        error: "EIO: rename",
      }),
    );
    expect(result.tempFileLeft).toBeUndefined();
    expect(result.detail).toContain("device file was not changed");
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
    expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
  });

  it.each(["EPERM", "EBUSY", "EACCES"])(
    "says to close Live's Set when the rename fails with %s",
    (code) => {
      put(source, fakeDevice("2.4.1"));
      put(device(), fakeDevice("2.4.0"));
      fault.rename = code;

      const result = installDevice(library, source);

      expect(result.outcome).toBe("failed");
      expect(result.detail).toContain("close any Set that uses Producer Pal");
      expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
      expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
    },
  );

  it.each(["EACCES", "EPERM"])(
    "doesn't blame Live when the copy fails with %s",
    (code) => {
      put(source, fakeDevice("2.4.1"));
      put(device(), fakeDevice("2.4.0"));
      fault.copy = code;

      const result = installDevice(library, source);

      expect(result.outcome).toBe("failed");
      expect(result.detail).not.toContain("Live");
      expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
    },
  );

  it("keeps the old file and removes the temp file when chmod fails", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    fault.chmod = true;

    expect(installDevice(library, source).outcome).toBe("failed");
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
    expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
  });

  it("doesn't blame Live for a failure that isn't a lock", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    fault.rename = "EIO";

    expect(installDevice(library, source).detail).not.toContain("Live");
  });

  it("removes a partly written temp file when the copy fails", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    fault.copy = "ENOSPC";

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({ outcome: "failed", changed: false }),
    );
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
    expect(folderNames()).toStrictEqual(["Producer_Pal.amxd"]);
  });

  it("names a temp file it can't delete", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    fault.rename = "EBUSY";
    fault.remove = ".tmp-";

    const result = installDevice(library, source);
    const left = folderNames().find((name) => name.includes(".tmp-"));

    expect(left).toBeDefined();
    expect(result.tempFileLeft).toBe(join(dirname(device()), left ?? ""));
    expect(result.detail).toContain(result.tempFileLeft);
    expect(readFileSync(device())).toStrictEqual(fakeDevice("2.4.0"));
  });

  it("reports no folders when a plain mkdir fails", () => {
    put(source, fakeDevice("2.4.0"));
    fault.mkdir = true;

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({
        outcome: "failed",
        changed: false,
        createdFolders: [],
      }),
    );
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });

  it("reports folders made before a failure", () => {
    put(source, fakeDevice("2.4.0"));
    fault.mkdirPartial = join(library, "Presets");

    const result = installDevice(library, source);

    expect(result).toStrictEqual(
      expect.objectContaining({
        outcome: "failed",
        changed: false,
        createdFolders: [join(library, "Presets")],
      }),
    );
    expect(result.detail).toContain(`Folders made before it failed`);
    expect(existsSync(device())).toBe(false);
  });

  it("keeps a failed first install from leaving a device file", () => {
    put(source, fakeDevice("2.4.0"));
    fault.rename = "EPERM";

    const result = installDevice(library, source);

    expect(result.outcome).toBe("failed");
    expect(existsSync(device())).toBe(false);
    expect(folderNames()).toStrictEqual([]);
    // The folders were made, and the result says so.
    expect(result.createdFolders).toHaveLength(3);
  });

  it("goes ahead when a stale temp file can't be deleted", () => {
    put(source, fakeDevice("2.4.1"));
    put(device(), fakeDevice("2.4.0"));
    const stale = `${device()}.tmp-0f8fad5b-d9cb-469f-a165-70867728950e`;
    const longAgo = new Date(Date.now() - 120_000);

    put(stale, "x");
    utimesSync(stale, longAgo, longAgo);
    fault.remove = "0f8fad5b";

    expect(installDevice(library, source).outcome).toBe("updated");
  });
});

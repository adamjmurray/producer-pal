// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import {
  deviceFilePath,
  deviceFileStatus,
  readDeviceVersion,
} from "../device-file-status.ts";
import { fakeDevice, makeScratchLibrary, put } from "./device-test-helpers.ts";

let library: string;
let source: string;

beforeEach(() => {
  library = makeScratchLibrary();
  source = join(library, "..", `bundled-${Date.now()}-${Math.random()}.amxd`);
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
  rmSync(source, { force: true });
});

describe("deviceFilePath", () => {
  it("is Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd", () => {
    expect(deviceFilePath("/lib")).toBe(
      join(
        "/lib",
        "Presets",
        "MIDI Effects",
        "Max MIDI Effect",
        "Producer_Pal.amxd",
      ),
    );
  });
});

describe("readDeviceVersion", () => {
  it("finds the version marker", () => {
    expect(readDeviceVersion(fakeDevice("2.4.0"))).toBe("2.4.0");
  });

  it("keeps a pre-release suffix", () => {
    expect(readDeviceVersion(fakeDevice("2.5.0-rc1"))).toBe("2.5.0-rc1");
  });

  it("is undefined with no marker", () => {
    expect(readDeviceVersion(fakeDevice())).toBeUndefined();
  });

  it("skips a marker that isn't a version and takes the next one", () => {
    const bytes = Buffer.concat([
      Buffer.from('const VERSION = "not a version"'),
      fakeDevice("1.2.3"),
    ]);

    expect(readDeviceVersion(bytes)).toBe("1.2.3");
  });

  it("ignores a marker with no closing quote or an over-long value", () => {
    expect(readDeviceVersion(Buffer.from('const VERSION = "2.4.0'))).toBe(
      undefined,
    );
    expect(
      readDeviceVersion(Buffer.from(`const VERSION = "${"1".repeat(40)}"`)),
    ).toBeUndefined();
  });
});

describe("deviceFileStatus", () => {
  const installAt = (contents: Buffer): void =>
    put(deviceFilePath(library), contents);

  it("says not-installed, with the bundled version", () => {
    put(source, fakeDevice("2.4.0"));

    expect(deviceFileStatus(library, source)).toStrictEqual({
      path: deviceFilePath(library),
      state: "not-installed",
      bundledVersion: "2.4.0",
      otherCopies: [],
    });
  });

  it("says same for identical bytes", () => {
    put(source, fakeDevice("2.4.0"));
    installAt(fakeDevice("2.4.0"));

    expect(deviceFileStatus(library, source).state).toBe("same");
  });

  it("says same for identical files with no version", () => {
    put(source, fakeDevice());
    installAt(fakeDevice());

    expect(deviceFileStatus(library, source).state).toBe("same");
  });

  it("says installed-older and names both versions", () => {
    put(source, fakeDevice("2.4.1"));
    installAt(fakeDevice("2.4.0"));

    expect(deviceFileStatus(library, source)).toStrictEqual(
      expect.objectContaining({
        state: "installed-older",
        installedVersion: "2.4.0",
        bundledVersion: "2.4.1",
      }),
    );
  });

  it("says installed-newer", () => {
    put(source, fakeDevice("2.4.0"));
    installAt(fakeDevice("2.10.0"));

    expect(deviceFileStatus(library, source).state).toBe("installed-newer");
  });

  it("treats a release as newer than its own pre-release", () => {
    put(source, fakeDevice("2.5.0"));
    installAt(fakeDevice("2.5.0-rc1"));

    expect(deviceFileStatus(library, source).state).toBe("installed-older");
  });

  it("says different when the versions match but the bytes don't", () => {
    put(source, fakeDevice("2.4.0", "a"));
    installAt(fakeDevice("2.4.0", "b"));

    expect(deviceFileStatus(library, source).state).toBe("different");
  });

  it.each([
    ["2.5.0-rc1", "2.5.0-rc2"],
    ["2.5.0-rc2", "2.5.0-rc1"],
  ])("says different for installed %s and bundled %s", (installed, bundled) => {
    put(source, fakeDevice(bundled));
    installAt(fakeDevice(installed));

    expect(deviceFileStatus(library, source).state).toBe("different");
  });

  it("says different when the installed file has no version", () => {
    put(source, fakeDevice("2.4.0"));
    installAt(fakeDevice());

    expect(deviceFileStatus(library, source)).toStrictEqual(
      expect.objectContaining({
        state: "different",
        bundledVersion: "2.4.0",
      }),
    );
  });

  it("says different when the bundled file has no version", () => {
    put(source, fakeDevice());
    installAt(fakeDevice("2.4.0"));

    expect(deviceFileStatus(library, source).state).toBe("different");
  });

  it("says different, rather than throwing, when the installed file can't be read", () => {
    put(source, fakeDevice("2.4.0"));
    // A folder where the file should be.
    put(join(deviceFilePath(library), "x"), "");

    expect(deviceFileStatus(library, source).state).toBe("different");
  });

  it("lists other copies", () => {
    put(source, fakeDevice("2.4.0"));
    installAt(fakeDevice("2.4.0"));
    put(join(library, "Producer_Pal.amxd"), "");

    expect(deviceFileStatus(library, source).otherCopies).toStrictEqual([
      join(library, "Producer_Pal.amxd"),
    ]);
  });

  it("refuses a User Library that isn't a folder", () => {
    put(source, fakeDevice("2.4.0"));

    expect(() => deviceFileStatus(join(library, "nope"), source)).toThrow(
      UserLibraryFolderError,
    );
  });

  it("throws when the bundled device can't be read", () => {
    expect(() => deviceFileStatus(library, source)).toThrow(
      "The bundled device can't be read",
    );
  });
});

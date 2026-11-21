// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { renameSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deviceFileFacts,
  forgetAllDeviceFiles,
  forgetDeviceFile,
} from "../device-file-facts.ts";
import { deviceFileStatus } from "../device-file-status.ts";
import {
  fakeDevice,
  makeScratchLibrary,
  put,
} from "../../tests/device-test-helpers.ts";

const reads = vi.hoisted(() => ({ files: [] as string[] }));

vi.mock(
  import("#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      readLibraryBytes: (file) => {
        reads.files.push(file);

        return actual.readLibraryBytes(file);
      },
    };
  },
);

// Whole seconds, so the stamp matches exactly between files.
const SAME_TIME = 1_700_000_000;

let library: string;
let file: string;

beforeEach(() => {
  library = makeScratchLibrary();
  file = join(library, "device.amxd");
  reads.files = [];
  forgetAllDeviceFiles();
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

describe("deviceFileFacts", () => {
  it("reads a file once and recalls it while it is unchanged", () => {
    put(file, fakeDevice("2.5.0"));

    const first = deviceFileFacts(file);
    const again = deviceFileFacts(file);

    expect(first.version).toBe("2.5.0");
    expect(again).toBe(first);
    expect(reads.files).toStrictEqual([file]);
  });

  it("reads again when only the modified time changes", () => {
    put(file, fakeDevice("2.5.0", "a"));

    const before = deviceFileFacts(file);

    put(file, fakeDevice("2.5.0", "b"));
    utimesSync(file, new Date(), new Date(Date.now() + 5000));

    expect(deviceFileFacts(file).digest).not.toBe(before.digest);
    expect(reads.files).toHaveLength(2);
  });

  it("reads again when only the size changes", () => {
    put(file, fakeDevice("2.5.0", "a"));
    utimesSync(file, SAME_TIME, SAME_TIME);

    const before = deviceFileFacts(file);

    put(file, fakeDevice("2.5.0", "bb"));
    utimesSync(file, SAME_TIME, SAME_TIME);

    expect(deviceFileFacts(file).digest).not.toBe(before.digest);
    expect(reads.files).toHaveLength(2);
  });

  it("reads again when a different file with the same size and modified time replaces it", () => {
    put(file, fakeDevice("2.5.0", "a"));
    utimesSync(file, SAME_TIME, SAME_TIME);

    const before = deviceFileFacts(file);
    const other = join(library, "other.amxd");

    put(other, fakeDevice("2.5.0", "b"));
    utimesSync(other, SAME_TIME, SAME_TIME);
    renameSync(other, file);

    expect(deviceFileFacts(file).digest).not.toBe(before.digest);
    expect(reads.files).toHaveLength(2);
  });

  it("reads again after the file was forgotten", () => {
    put(file, fakeDevice("2.5.0"));
    deviceFileFacts(file);
    forgetDeviceFile(file);
    deviceFileFacts(file);

    expect(reads.files).toHaveLength(2);
  });

  it("keeps nothing for a file that can't be read, and finds it when it appears", () => {
    expect(() => deviceFileFacts(file)).toThrow(/ENOENT/);

    put(file, fakeDevice("2.5.0"));

    expect(deviceFileFacts(file).version).toBe("2.5.0");
  });

  it("keeps the first bytes, which show whether the device is frozen", () => {
    put(file, fakeDevice("2.5.0"));

    expect(deviceFileFacts(file).header.subarray(0, 4).toString()).toBe("ampf");
  });
});

describe("deviceFileStatus reads", () => {
  it("does not read the device files again on the next status", () => {
    const source = join(library, "bundled.amxd");

    put(source, fakeDevice("2.5.0"));
    put(
      join(
        library,
        "Presets",
        "MIDI Effects",
        "Max MIDI Effect",
        "Producer_Pal.amxd",
      ),
      fakeDevice("2.4.0"),
    );

    const first = deviceFileStatus(library, source);
    const readsAfterFirst = reads.files.length;
    const second = deviceFileStatus(library, source);

    expect(first.state).toBe("installed-older");
    expect(second).toStrictEqual(first);
    expect(readsAfterFirst).toBe(2);
    expect(reads.files).toHaveLength(readsAfterFirst);
  });

  it("notices an installed device that changed between statuses", () => {
    const source = join(library, "bundled.amxd");
    const installed = join(
      library,
      "Presets",
      "MIDI Effects",
      "Max MIDI Effect",
      "Producer_Pal.amxd",
    );

    put(source, fakeDevice("2.5.0"));
    put(installed, fakeDevice("2.4.0"));

    expect(deviceFileStatus(library, source).state).toBe("installed-older");

    put(installed, fakeDevice("2.5.0"));

    expect(deviceFileStatus(library, source).state).toBe("same");
  });
});

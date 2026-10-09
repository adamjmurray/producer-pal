// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDeviceCopies,
  checkDeviceVersion,
  checkFrozenDevice,
  FROZEN_DEVICE_FILENAME,
  versionMarker,
} from "./frozen-device.ts";

let releaseDir: string;

beforeEach(() => {
  releaseDir = mkdtempSync(join(tmpdir(), "ppal-frozen-device-"));
});

afterEach(() => {
  rmSync(releaseDir, { recursive: true, force: true });
});

/**
 * Lay out a release/ folder the way `npm run release` and the freeze leave it.
 *
 * @param options - What to write; a null skips that file
 * @param options.buildVersion - The version recorded in build-info.json
 * @param options.deviceText - The device's bytes
 * @param options.deviceAgeSeconds - How much newer than build-info.json the device is
 */
function layOutRelease(options: {
  buildVersion?: string | null;
  deviceText?: string | null;
  deviceAgeSeconds?: number;
}): void {
  const {
    buildVersion = "2.5.0",
    deviceText = null,
    deviceAgeSeconds = 60,
  } = options;
  const buildTime = 1_800_000_000;

  if (buildVersion != null) {
    writeFileSync(
      join(releaseDir, "build-info.json"),
      JSON.stringify({ version: buildVersion, commit: "abc1234" }),
    );
    utimesSync(join(releaseDir, "build-info.json"), buildTime, buildTime);
  }

  if (deviceText != null) {
    const devicePath = join(releaseDir, FROZEN_DEVICE_FILENAME);
    const deviceTime = buildTime + deviceAgeSeconds;

    writeFileSync(devicePath, deviceText);
    utimesSync(devicePath, deviceTime, deviceTime);
  }
}

const DEVICE_2_5_0 = `junk ${versionMarker("2.5.0")}; more junk`;

describe("checkFrozenDevice", () => {
  it("accepts a device frozen from this build", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0 });

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0" })).toBeNull();
  });

  it("accepts a release candidate version", () => {
    layOutRelease({
      buildVersion: "2.5.0-rc1",
      deviceText: versionMarker("2.5.0-rc1"),
    });

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0-rc1" })).toBeNull();
  });

  it("refuses when the device file is missing", () => {
    layOutRelease({});

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0" })).toContain(
      "Producer_Pal.amxd not found",
    );
  });

  it("refuses when build-info.json is missing", () => {
    layOutRelease({ buildVersion: null, deviceText: DEVICE_2_5_0 });

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0" })).toContain(
      "build-info.json is missing",
    );
  });

  it("refuses when release/ was built for another version", () => {
    layOutRelease({ buildVersion: "2.4.0", deviceText: DEVICE_2_5_0 });

    const refusal = checkFrozenDevice({ releaseDir, version: "2.5.0" });

    expect(refusal).toContain("build in release/ is 2.4.0");
    expect(refusal).toContain("package.json says 2.5.0");
  });

  it("refuses a device frozen from another version", () => {
    layOutRelease({ deviceText: `x ${versionMarker("2.4.0")} y` });

    const refusal = checkFrozenDevice({ releaseDir, version: "2.5.0" });

    expect(refusal).toContain('const VERSION = "2.5.0"');
    expect(refusal).toContain("npm run release");
  });

  it("refuses a device with no version marker at all", () => {
    layOutRelease({ deviceText: "no marker in here" });

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0" })).toContain(
      "does not contain",
    );
  });

  it("refuses a device older than the build, frozen from an earlier build of the same version", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0, deviceAgeSeconds: -60 });

    const refusal = checkFrozenDevice({ releaseDir, version: "2.5.0" });

    expect(refusal).toContain("older than release/build-info.json");
    expect(refusal).toContain("Freeze the device again");
  });

  it("accepts a device saved in the same instant as the build", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0, deviceAgeSeconds: 0 });

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0" })).toBeNull();
  });

  it("does not take a longer version for a match", () => {
    layOutRelease({ deviceText: versionMarker("2.5.0-rc1") });

    expect(checkFrozenDevice({ releaseDir, version: "2.5.0" })).toContain(
      "does not contain",
    );
  });
});

describe("checkDeviceVersion", () => {
  it("reports a missing file", () => {
    expect(
      checkDeviceVersion(join(releaseDir, "nope.amxd"), "2.5.0"),
    ).toContain("not found");
  });

  it("accepts a matching device", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0 });

    expect(
      checkDeviceVersion(join(releaseDir, FROZEN_DEVICE_FILENAME), "2.5.0"),
    ).toBeNull();
  });
});

describe("assertDeviceCopies", () => {
  it("passes when every folder holds an identical copy", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0 });
    writeFileSync(join(releaseDir, "copy.amxd"), DEVICE_2_5_0);

    expect(() =>
      assertDeviceCopies(join(releaseDir, FROZEN_DEVICE_FILENAME), []),
    ).not.toThrow();
  });

  it("throws when a folder has no copy", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0 });

    expect(() =>
      assertDeviceCopies(join(releaseDir, FROZEN_DEVICE_FILENAME), [
        join(releaseDir, "elsewhere"),
      ]),
    ).toThrow("was not written");
  });

  it("throws when a copy differs", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0 });

    const other = mkdtempSync(join(tmpdir(), "ppal-frozen-copy-"));

    try {
      writeFileSync(join(other, FROZEN_DEVICE_FILENAME), "an old device");

      expect(() =>
        assertDeviceCopies(join(releaseDir, FROZEN_DEVICE_FILENAME), [other]),
      ).toThrow("differs");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("passes with a matching copy in the folder", () => {
    layOutRelease({ deviceText: DEVICE_2_5_0 });

    const same = mkdtempSync(join(tmpdir(), "ppal-frozen-copy-"));

    try {
      writeFileSync(join(same, FROZEN_DEVICE_FILENAME), DEVICE_2_5_0);

      expect(() =>
        assertDeviceCopies(join(releaseDir, FROZEN_DEVICE_FILENAME), [same]),
      ).not.toThrow();
    } finally {
      rmSync(same, { recursive: true, force: true });
    }
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DeviceInstallResult,
  installDevice,
} from "#src/portal/setup/device-install.ts";
import {
  describeDeviceInstall,
  releaseDevicePath,
  requireReleaseDevice,
} from "./release-device.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-device-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function deviceBytes(version: string): string {
  return `...const VERSION = "${version}"...`;
}

describe("requireReleaseDevice", () => {
  it("tells the user to run release:amxd when the device isn't built", () => {
    expect(() => requireReleaseDevice(root)).toThrow(
      /Producer_Pal\.amxd not found\. Run `npm run release:amxd` first\./,
    );
  });

  it("returns the release device when it exists", () => {
    mkdirSync(join(root, "release"));
    writeFileSync(releaseDevicePath(root), deviceBytes("1.0.0"));

    expect(requireReleaseDevice(root)).toBe(
      join(root, "release/Producer_Pal.amxd"),
    );
  });
});

describe("describeDeviceInstall", () => {
  function install(
    installed: string | undefined,
    force = false,
  ): ReturnType<typeof describeDeviceInstall> {
    const library = join(root, "lib");
    const folder = join(library, "Presets/MIDI Effects/Max MIDI Effect");
    const source = join(root, "release.amxd");

    mkdirSync(folder, { recursive: true });
    writeFileSync(source, deviceBytes("1.0.0"));

    if (installed != null) {
      writeFileSync(join(folder, "Producer_Pal.amxd"), deviceBytes(installed));
    }

    return describeDeviceInstall(installDevice(library, source, { force }));
  }

  it("installs into an empty library", () => {
    const { lines, ok } = install(undefined);

    expect(ok).toBe(true);
    expect(lines.join("\n")).toContain("Installed the device.");
  });

  it("fails the run when a newer device is skipped, until --force", () => {
    const skipped = install("2.0.0");

    expect(skipped.ok).toBe(false);
    expect(skipped.lines.join("\n")).toContain("install:device -- --force");
    expect(install("2.0.0", true).ok).toBe(true);
  });

  it("warns about other copies", () => {
    const result = {
      outcome: "current",
      detail: "Same.",
      path: "/lib/Producer_Pal.amxd",
      otherCopies: ["/lib/a/Producer_Pal 2.amxd"],
    } as DeviceInstallResult;
    const { lines, ok } = describeDeviceInstall(result);

    expect(ok).toBe(true);
    expect(lines.join("\n")).toMatch(
      /WARNING: 1 other[^]*Producer_Pal 2\.amxd/,
    );
  });
});

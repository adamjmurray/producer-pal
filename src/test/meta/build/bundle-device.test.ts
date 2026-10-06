// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The build plugin that puts the frozen device beside the portal. A plain build
// must leave none behind, or a stale copy from an earlier release package would
// ship as if it were current.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUNDLED_DEVICE_FILENAME } from "#src/portal/bundled-device.ts";
import { FROZEN_DEVICE_FILENAME } from "../../../../scripts/build-and-release/helpers/release-package/frozen-device.ts";
import {
  bundleDevice,
  DEVICE_FILENAME,
} from "../../../../config/rolldown-plugin-bundle-device.mjs";

let scratchDir: string;
let dirs: string[];

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "ppal-bundle-device-"));
  dirs = [join(scratchDir, "extension"), join(scratchDir, "npm")];

  for (const dir of dirs) {
    mkdirSync(dir);
  }
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

/**
 * Run the plugin's write step.
 *
 * @param deviceFile - The frozen device to bundle, or undefined for a plain build
 */
function write(deviceFile: string | undefined): void {
  const plugin = bundleDevice({ dirs, deviceFile });

  (plugin.writeBundle as () => void)();
}

describe("bundleDevice", () => {
  it("names the file the same in the portal, the plugin and the packaging script", () => {
    expect(DEVICE_FILENAME).toBe(BUNDLED_DEVICE_FILENAME);
    expect(FROZEN_DEVICE_FILENAME).toBe(BUNDLED_DEVICE_FILENAME);
  });

  it("copies the frozen device into every folder", () => {
    const frozen = join(scratchDir, "frozen.amxd");

    writeFileSync(frozen, "frozen bytes");
    write(frozen);

    for (const dir of dirs) {
      expect(readFileSync(join(dir, DEVICE_FILENAME), "utf8")).toBe(
        "frozen bytes",
      );
    }
  });

  it("removes a stale copy when the build has no device", () => {
    for (const dir of dirs) {
      writeFileSync(join(dir, DEVICE_FILENAME), "last release");
    }

    write(undefined);

    for (const dir of dirs) {
      expect(existsSync(join(dir, DEVICE_FILENAME))).toBe(false);
    }
  });

  it("treats an empty path as no device", () => {
    writeFileSync(join(dirs[0] as string, DEVICE_FILENAME), "last release");

    write("");

    expect(existsSync(join(dirs[0] as string, DEVICE_FILENAME))).toBe(false);
  });

  it("does nothing when there is no copy to remove", () => {
    expect(() => write(undefined)).not.toThrow();
  });
});

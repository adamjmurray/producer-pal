// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUNDLED_DEVICE_FILENAME,
  findBundledDevice,
} from "../bundled-device.ts";

let portalDir: string;

beforeEach(() => {
  portalDir = mkdtempSync(join(tmpdir(), "ppal-bundled-device-"));
});

afterEach(() => {
  rmSync(portalDir, { recursive: true, force: true });
});

describe("findBundledDevice", () => {
  it("returns the device file that sits beside the portal", () => {
    writeFileSync(join(portalDir, BUNDLED_DEVICE_FILENAME), "device");

    expect(findBundledDevice(portalDir)).toBe(
      join(portalDir, "Producer_Pal.amxd"),
    );
  });

  it("returns null when no device shipped", () => {
    writeFileSync(join(portalDir, "producer-pal-portal.js"), "portal");

    expect(findBundledDevice(portalDir)).toBeNull();
  });

  it("looks beside the running script by default, where a plain build has none", () => {
    // Run from source, the portal sits in src/portal/setup/, which never holds one.
    expect(findBundledDevice()).toBeNull();
  });
});

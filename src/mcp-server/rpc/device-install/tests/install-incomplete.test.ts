// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { installedRemoteScript } from "../../remote-script/remote-script-status.ts";
import { remoteScriptPath } from "../../remote-script/install/remote-script-install.ts";
import { type DeviceInstallStatus } from "../device-install-status.ts";
import { installIncomplete } from "../install-incomplete.ts";
import { useDeviceScratch } from "./device-install-test-helpers.ts";

describe("installIncomplete", () => {
  const scratch = useDeviceScratch();

  /**
   * Put a remote script of some version in the scratch User Library.
   *
   * @param version - Its version, or null for a script with no readable one
   */
  function installScript(version: string | null): void {
    const folder = remoteScriptPath(scratch().library);

    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "__init__.py"), "");

    if (version != null) {
      writeFileSync(join(folder, "version.py"), `VERSION = "${version}"\n`);
    }
  }

  /**
   * @param overrides - Status fields to change
   * @returns A frozen device with a current copy in the scratch User Library
   */
  function device(
    overrides: Partial<DeviceInstallStatus> = {},
  ): DeviceInstallStatus {
    return {
      source: "/Users/me/Downloads/Producer_Pal.amxd",
      problem: null,
      userLibrary: scratch().library,
      path: null,
      inUserLibrary: false,
      state: "same",
      version: VERSION,
      installedVersion: VERSION,
      otherCopies: [],
      ...overrides,
    };
  }

  it("is complete when the copy is current and the remote script is current", () => {
    installScript(VERSION);

    expect(installIncomplete(device())).toBe(false);
  });

  it.each(["not-installed", "installed-older"] as const)(
    "is incomplete when the User Library copy is %s",
    (state) => {
      installScript(VERSION);

      expect(installIncomplete(device({ state }))).toBe(true);
    },
  );

  it.each(["installed-newer", "different", "same"] as const)(
    "leaves a %s copy to the user",
    (state) => {
      installScript(VERSION);

      expect(installIncomplete(device({ state }))).toBe(false);
    },
  );

  it("doesn't count the copy for a device that can't be copied", () => {
    installScript(VERSION);

    expect(
      installIncomplete(device({ problem: "not-frozen", state: null })),
    ).toBe(false);
  });

  it("is incomplete when the remote script is missing", () => {
    expect(installIncomplete(device())).toBe(true);
  });

  it("is incomplete when the remote script is older, or its version unreadable", () => {
    installScript("0.0.1");
    expect(installIncomplete(device())).toBe(true);

    installScript(null);
    expect(installIncomplete(device())).toBe(true);
  });

  it("counts a newer remote script as current", () => {
    installScript("999.0.0");

    expect(installIncomplete(device())).toBe(false);
    expect(installedRemoteScript(scratch().library).installed).toBe(true);
  });

  it("has nothing to compare without a User Library", () => {
    expect(
      installIncomplete(
        device({ userLibrary: null, problem: "no-user-library", state: null }),
      ),
    ).toBe(false);
  });

  it("is incomplete for a missing remote script even before the device says where it is", () => {
    expect(
      installIncomplete(
        device({ source: null, problem: "unknown-source", state: null }),
      ),
    ).toBe(true);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installPluginHostParts,
  pluginHostStates,
} from "#src/portal/setup/plugin-host/plugin-host-part.ts";
import { VERSION } from "#src/shared/config.ts";
import { installedRemoteScript } from "../../remote-script/remote-script-status.ts";
import { installRemoteScript } from "../../remote-script/install/remote-script-install.ts";
import { type DeviceInstallStatus } from "../device-install-status.ts";
import { installIncomplete } from "../install-incomplete.ts";
import { useDeviceScratch } from "./device-install-test-helpers.ts";

describe("installIncomplete", () => {
  const scratch = useDeviceScratch();

  // Most cases are about the device and the script: start with wrappers in.
  beforeEach(() => {
    installPluginHostParts(scratch().library);
  });

  /**
   * Install the bundled remote script in the scratch User Library, then give
   * it another version when asked. Only a real install matches this build.
   *
   * @param version - Its version, or null for a script with no readable one
   */
  function installScript(version: string | null): void {
    const { path } = installRemoteScript(scratch().library);

    if (version == null) {
      rmSync(join(path, "version.py"));
    } else if (version !== VERSION) {
      writeFileSync(join(path, "version.py"), `VERSION = "${version}"\n`);
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

  describe("plug-in wrapper devices", () => {
    /** Leave the scratch User Library without one of the wrappers. */
    function removeOneWrapper(): void {
      const [wrapper] = pluginHostStates(scratch().library) ?? [];

      rmSync(wrapper?.path ?? "");
    }

    it("is incomplete when a wrapper is missing", () => {
      installScript(VERSION);
      removeOneWrapper();

      expect(installIncomplete(device())).toBe(true);
    });

    it("is incomplete when a wrapper differs from this build", () => {
      installScript(VERSION);

      const [wrapper] = pluginHostStates(scratch().library) ?? [];

      writeFileSync(wrapper?.path ?? "", "another build");

      expect(installIncomplete(device())).toBe(true);
    });

    it("counts them for a development device, which installs them alone", () => {
      installScript(VERSION);
      removeOneWrapper();

      expect(
        installIncomplete(device({ problem: "not-frozen", state: null })),
      ).toBe(true);
    });

    it("leaves them alone when the copy is newer than this device", () => {
      installScript(VERSION);
      removeOneWrapper();

      expect(installIncomplete(device({ state: "installed-newer" }))).toBe(
        false,
      );
    });
  });
});

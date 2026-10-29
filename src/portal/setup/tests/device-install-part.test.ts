// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { UPDATE_PORTAL_ADVICE } from "#src/shared/config.ts";
import { installPartOfDevice } from "../device-install-part.ts";
import { type DeviceInstallResult } from "../device-install.ts";

/**
 * @param fields - What this test sets
 * @returns A device install result
 */
function result(fields: Partial<DeviceInstallResult>): DeviceInstallResult {
  return {
    outcome: "installed",
    path: "/lib/Producer_Pal.amxd",
    detail: "detail",
    changed: true,
    createdFolders: [],
    otherCopies: [],
    ...fields,
  };
}

describe("installPartOfDevice", () => {
  it.each(["installed", "current"] as const)(
    "reports %s plainly",
    (outcome) => {
      expect(
        installPartOfDevice(
          result({ outcome, bundledVersion: "2.5.0" }),
          "portal",
        ),
      ).toStrictEqual({
        status: outcome,
        path: "/lib/Producer_Pal.amxd",
        version: "2.5.0",
      });
    },
  );

  it("leaves the version out when none is known", () => {
    expect(installPartOfDevice(result({}), "device")).toStrictEqual({
      status: "installed",
      path: "/lib/Producer_Pal.amxd",
    });
  });

  it("carries the detail of an update", () => {
    expect(
      installPartOfDevice(
        result({ outcome: "updated", detail: "Replaced it." }),
        "portal",
      ),
    ).toStrictEqual({
      status: "updated",
      path: "/lib/Producer_Pal.amxd",
      detail: "Replaced it.",
    });
  });

  it("keeps a newer device and tells a portal user to update the portal", () => {
    const part = installPartOfDevice(
      result({
        outcome: "skipped",
        previousVersion: "9.0.0",
        bundledVersion: "2.5.0",
      }),
      "portal",
    );

    expect(part).toStrictEqual({
      status: "kept",
      path: "/lib/Producer_Pal.amxd",
      version: "2.5.0",
      detail: `left the installed device (9.0.0) as it is: it is newer than this portal's (2.5.0). ${UPDATE_PORTAL_ADVICE}`,
    });
  });

  it("keeps a device that can't be ordered, without calling it newer", () => {
    expect(
      installPartOfDevice(
        result({ outcome: "skipped", bundledVersion: "2.5.0" }),
        "device",
      ).detail,
    ).toBe(
      "left the installed device (unknown version) as it is: it differs from this device's (2.5.0) and which is newer can't be told.",
    );
    expect(
      installPartOfDevice(result({ outcome: "skipped" }), "portal").detail,
    ).toContain("differs from this portal's (unknown version)");
  });

  it("reports a failed copy with its cause, and a cause that is missing", () => {
    expect(
      installPartOfDevice(
        result({ outcome: "failed", detail: "Couldn't.", error: "EBUSY" }),
        "portal",
      ),
    ).toStrictEqual({
      ok: false,
      path: "/lib/Producer_Pal.amxd",
      detail: "Couldn't. Cause: EBUSY.",
    });
    expect(
      installPartOfDevice(
        result({ outcome: "failed", detail: "Couldn't." }),
        "device",
      ),
    ).toStrictEqual({
      ok: false,
      path: "/lib/Producer_Pal.amxd",
      detail: "Couldn't. Cause: unknown.",
    });
  });
});

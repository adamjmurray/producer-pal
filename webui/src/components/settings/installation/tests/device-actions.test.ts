// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  deviceActions,
  installReplaces,
  type DeviceActionsContext,
} from "#webui/components/settings/installation/helpers/device-actions";
import { deviceStatusBody } from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { USER_LIBRARY } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";

const ALLOWED = { allowed: true, reason: null };

/**
 * @param status - Status fields to change from "no copy yet"
 * @param ctx - Context fields to change from the detected path
 * @returns The install button and swap line
 */
function actions(
  status: Partial<DeviceInstallStatus> = {},
  ctx: Partial<DeviceActionsContext> = {},
): ReturnType<typeof deviceActions> {
  return deviceActions(deviceStatusBody(status), {
    path: USER_LIBRARY,
    isDetected: true,
    installing: false,
    swapStarted: false,
    ...ctx,
  });
}

describe("deviceActions install", () => {
  it("offers Copy when there is no copy yet", () => {
    expect(actions().install).toStrictEqual({
      label: "Copy",
      disabled: false,
    });
  });

  it("offers Update for an older copy", () => {
    expect(
      actions({ state: "installed-older", installedVersion: "1.1.0" }).install,
    ).toStrictEqual({ label: "Update copy", disabled: false });
  });

  it.each(["installed-newer", "different"] as const)(
    "offers Replace for a %s copy",
    (state) => {
      expect(actions({ state }).install?.label).toBe(
        "Replace with this device",
      );
    },
  );

  it("offers nothing once the copy is this device", () => {
    expect(actions({ state: "same" }).install).toBeNull();
  });

  it("offers a plain Copy for a typed path the status doesn't describe", () => {
    expect(
      actions({ state: "same" }, { path: "/elsewhere", isDetected: false })
        .install,
    ).toStrictEqual({ label: "Copy", disabled: false });
  });

  it("is off with no path, and while installing", () => {
    expect(actions({}, { path: "" }).install?.disabled).toBe(true);
    expect(actions({}, { installing: true }).install).toStrictEqual({
      label: "Installing…",
      disabled: true,
    });
  });

  it("is off for a development build", () => {
    expect(
      actions({ problem: "not-frozen", state: null, path: null }).install,
    ).toStrictEqual({ label: "Copy", disabled: true });
  });

  it("works with no User Library found, once a path is typed", () => {
    expect(
      actions({ problem: "no-user-library", state: null }).install,
    ).toStrictEqual({ label: "Copy", disabled: false });
  });

  it.each(["unknown-source", "unreadable-source"] as const)(
    "offers nothing when the device is %s",
    (problem) => {
      expect(actions({ problem, state: null }).install).toBeNull();
    },
  );
});

describe("deviceActions swap", () => {
  const COPY = { state: "same" as const, swap: ALLOWED };

  it("offers the swap when the Set uses a copy from elsewhere", () => {
    expect(actions(COPY).swap).toStrictEqual({
      text: "This Set uses a copy from elsewhere.",
      enabled: true,
    });
  });

  it("shows the server's reason, with the swap off", () => {
    const reason = "The remote script isn't running.";

    expect(
      actions({ state: "same", swap: { allowed: false, reason } }).swap,
    ).toStrictEqual({ text: reason, enabled: false });
    expect(
      actions({ state: "same", swap: { allowed: false, reason: null } }).swap
        ?.text,
    ).toBe("The swap isn't available.");
  });

  it("turns the swap off for a typed path the status doesn't describe", () => {
    expect(actions(COPY, { isDetected: false }).swap).toStrictEqual({
      text: "The swap uses the detected User Library. Put it back in the field above to swap.",
      enabled: false,
    });
  });

  it.each([
    ["the device is the User Library copy", { inUserLibrary: true }],
    ["the device hasn't said where it is", { source: null }],
    [
      "it is a development build",
      { problem: "not-frozen" as const, state: null },
    ],
    ["there is no copy to swap to", { state: "not-installed" as const }],
    ["the copy is older", { state: "installed-older" as const }],
  ])("has no swap when %s", (_what, overrides) => {
    expect(actions({ ...COPY, ...overrides }).swap).toBeNull();
  });

  it("drops the swap while it runs", () => {
    expect(actions(COPY, { swapStarted: true }).swap).toBeNull();
  });
});

describe("installReplaces", () => {
  it.each([
    ["installed-newer", true, true],
    ["different", true, true],
    ["installed-older", true, false],
    ["same", true, false],
    ["installed-newer", false, false],
  ] as const)("%s, detected %s: %s", (state, isDetected, expected) => {
    expect(installReplaces(deviceStatusBody({ state }), isDetected)).toBe(
      expected,
    );
  });
});

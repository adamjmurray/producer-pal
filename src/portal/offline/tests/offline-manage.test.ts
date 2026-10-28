// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { INSTALL_NEXT_STEPS } from "#src/tools/core/helpers/manage-contract.ts";
import { VERSION } from "#src/shared/config.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { answerOfflineCall } from "../offline-call.ts";
import { offlineManage } from "../offline-manage.ts";
import { fakeOfflineDeps, noDevice } from "./offline-test-helpers.ts";

/**
 * @param response - A tool response
 * @returns Its text
 */
function textOf(response: McpResponse | null): string {
  return response?.content[0]?.text ?? "";
}

describe("offlineManage install-remote-script", () => {
  it("answers with the version, path and next steps, as the device does", async () => {
    const installRemoteScript = vi.fn(() =>
      Promise.resolve({
        installed: true as const,
        version: VERSION,
        path: "/lib/Remote Scripts/Producer_Pal",
      }),
    );
    const response = await offlineManage(
      { action: "install-remote-script", userLibrary: " /lib " },
      noDevice,
      fakeOfflineDeps({ installRemoteScript }),
    );

    expect(response?.isError).toBeUndefined();
    expect(textOf(response)).toBe(
      `{version:"${VERSION}",path:"/lib/Remote Scripts/Producer_Pal",nextSteps:${JSON.stringify(INSTALL_NEXT_STEPS)}}`,
    );
    expect(installRemoteScript).toHaveBeenCalledWith(" /lib ");
  });

  it("looks for the User Library when none is given", async () => {
    const installRemoteScript = vi.fn(() =>
      Promise.resolve({ installed: false as const, error: "x" }),
    );

    await offlineManage(
      { action: "install-remote-script" },
      noDevice,
      fakeOfflineDeps({ installRemoteScript }),
    );

    expect(installRemoteScript).toHaveBeenCalledWith(undefined);
  });

  it("passes on the install's own error, saying what it left", async () => {
    const response = await offlineManage(
      { action: "install-remote-script" },
      noDevice,
      fakeOfflineDeps({
        installRemoteScript: () =>
          Promise.resolve({
            installed: false,
            error:
              "couldn't find Live's User Library, so nothing was installed.",
          }),
      }),
    );

    expect(response?.isError).toBe(true);
    expect(textOf(response)).toBe(
      "Error: couldn't find Live's User Library, so nothing was installed.",
    );
  });

  it("reports an install that threw", async () => {
    const response = await offlineManage(
      { action: "install-remote-script" },
      noDevice,
      fakeOfflineDeps({
        installRemoteScript: () => Promise.reject(new Error("disk gone")),
      }),
    );

    expect(response?.isError).toBe(true);
    expect(textOf(response)).toBe("Error: disk gone");
  });
});

describe("offlineManage arguments", () => {
  it("refuses an unknown action the way the device does", async () => {
    const response = await offlineManage(
      { action: "wipe" },
      noDevice,
      fakeOfflineDeps(),
    );

    expect(response?.isError).toBe(true);
    expect(textOf(response)).toContain("action must be one of:");
    expect(textOf(response)).toContain('not "wipe"');
  });

  it("refuses a param the action doesn't read", async () => {
    const installRemoteScript = vi.fn();
    const response = await offlineManage(
      { action: "undo", userLibrary: "/x" },
      noDevice,
      fakeOfflineDeps({ installRemoteScript }),
    );

    expect(response?.isError).toBe(true);
    expect(textOf(response)).toContain("userLibrary");
    expect(installRemoteScript).not.toHaveBeenCalled();
  });

  it("refuses a userLibrary that isn't text", async () => {
    const response = await offlineManage(
      { action: "install-remote-script", userLibrary: 7 },
      noDevice,
      fakeOfflineDeps(),
    );

    expect(textOf(response)).toBe("Error: userLibrary must be a string");
  });

  it.each(["undo", "redo"])(
    "leaves %s to the setup guidance",
    async (action) => {
      expect(
        await offlineManage({ action }, noDevice, fakeOfflineDeps()),
      ).toBeNull();
    },
  );
});

describe("answerOfflineCall", () => {
  it("answers an install itself", async () => {
    const installRemoteScript = vi.fn(() =>
      Promise.resolve({
        installed: true as const,
        version: VERSION,
        path: "/lib/Remote Scripts/Producer_Pal",
      }),
    );
    const response = await answerOfflineCall(
      {
        name: "ppal-manage",
        args: { action: "install-remote-script" },
        manageOffered: true,
        connect: noDevice,
      },
      fakeOfflineDeps({ installRemoteScript }),
    );

    expect(response.isError).toBeUndefined();
    expect(textOf(response)).toContain("Producer_Pal");
  });

  it("gives undo the setup guidance", async () => {
    const response = await answerOfflineCall(
      {
        name: "ppal-manage",
        args: { action: "undo" },
        manageOffered: true,
        connect: noDevice,
      },
      fakeOfflineDeps(),
    );

    expect(textOf(response)).toContain("Cannot connect to Ableton Live.");
  });

  it("gives ppal-manage the setup guidance when this portal doesn't offer it", async () => {
    const installRemoteScript = vi.fn();
    const response = await answerOfflineCall(
      {
        name: "ppal-manage",
        args: { action: "install-remote-script" },
        manageOffered: false,
        connect: noDevice,
      },
      fakeOfflineDeps({ installRemoteScript }),
    );

    expect(textOf(response)).toContain("Cannot connect to Ableton Live.");
    expect(installRemoteScript).not.toHaveBeenCalled();
  });

  it("gives every other tool the setup guidance", async () => {
    const response = await answerOfflineCall(
      {
        name: "ppal-connect",
        args: {},
        manageOffered: true,
        connect: noDevice,
      },
      fakeOfflineDeps(),
    );

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain("Cannot connect to Ableton Live.");
  });
});

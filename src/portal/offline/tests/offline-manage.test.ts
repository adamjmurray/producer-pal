// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
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
      { action: "install-producer-pal", userLibrary: 7 },
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
  it("answers an install itself, under either name", async () => {
    for (const action of ["install-producer-pal", "install-remote-script"]) {
      const installRemoteScript = vi.fn(() => ({
        status: "installed" as const,
        path: "/lib/Remote Scripts/Producer_Pal",
      }));
      const response = await answerOfflineCall(
        {
          name: "ppal-manage",
          args: { action, userLibrary: tmpdir() },
          manageOffered: true,
          connect: noDevice,
        },
        fakeOfflineDeps({
          installRemoteScript,
          findBundledDevice: () => null,
        }),
      );

      expect(response.isError).toBeUndefined();
      expect(textOf(response)).toContain("Producer_Pal");
      expect(installRemoteScript).toHaveBeenCalledWith(tmpdir());
    }
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
        args: { action: "install-producer-pal" },
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

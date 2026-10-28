// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { type RemoteScriptPing } from "../../remote-script/remote-script-client.ts";
import { deviceInstallStatus } from "../device-install-status.ts";
import { deviceSwapCheck } from "../device-swap-check.ts";
import { recordDeviceSource } from "../device-source.ts";
import {
  frozenDevice,
  RUNNING_PING,
  useDeviceScratch,
} from "./device-install-test-helpers.ts";

// A release candidate, so a test can put an earlier or later one beside it.
// VERSION's type is its own literal value, hence the cast.
vi.mock(import("#src/shared/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, VERSION: "2.5.0-rc2" as typeof actual.VERSION };
});

const NOT_RUNNING_PING: RemoteScriptPing = {
  ...RUNNING_PING,
  running: false,
  scriptVersion: null,
};

describe("deviceSwapCheck", () => {
  const scratch = useDeviceScratch();

  /**
   * Check a swap with the device running from Downloads.
   *
   * @param copy - What the User Library holds, or undefined for nothing
   * @param ping - What the remote script answers
   * @returns The check
   */
  async function check(copy?: Buffer, ping = RUNNING_PING) {
    const { library, runFromDownloads, installed, put } = scratch();

    runFromDownloads(frozenDevice(VERSION));

    if (copy != null) {
      put(installed, copy);
    }

    return await deviceSwapCheck(
      await deviceInstallStatus(library),
      vi.fn(async () => ping),
    );
  }

  it("allows a swap for a copy of this version, and names the copy", async () => {
    expect(await check(frozenDevice(VERSION, "other bytes"))).toStrictEqual({
      allowed: true,
      copy: scratch().installed,
      reason: null,
    });
  });

  it("allows a swap for a newer copy", async () => {
    const result = await check(frozenDevice("999.0.0"));

    expect(result.allowed).toBe(true);
  });

  it("refuses while the device hasn't said where its file is", async () => {
    const { library } = scratch();
    const ping = vi.fn(async () => RUNNING_PING);
    const result = await deviceSwapCheck(
      await deviceInstallStatus(library),
      ping,
    );

    expect(result).toStrictEqual({
      allowed: false,
      reason: "This device hasn't said where its file is yet.",
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it("refuses without a User Library", async () => {
    const { runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));

    expect(
      await deviceSwapCheck(
        {
          ...(await deviceInstallStatus(scratch().library)),
          userLibrary: null,
        },
        vi.fn(),
      ),
    ).toStrictEqual({
      allowed: false,
      reason: "No User Library was found. Enter its path above.",
    });
  });

  it("refuses when the device already is the User Library copy", async () => {
    const { library, installed, put } = scratch();

    put(installed, frozenDevice(VERSION));
    recordDeviceSource(installed);

    expect(
      await deviceSwapCheck(await deviceInstallStatus(library), vi.fn()),
    ).toStrictEqual({
      allowed: false,
      reason: "This device is already the copy in your User Library.",
    });
  });

  it("sees through a link to the User Library copy", async () => {
    const { library, installed, downloads, put } = scratch();
    const link = join(downloads, "link.amxd");

    put(installed, frozenDevice(VERSION));
    symlinkSync(installed, link);
    recordDeviceSource(link);

    const status = await deviceInstallStatus(library);

    expect(status.inUserLibrary).toBe(true);
  });

  it("refuses when there is no copy", async () => {
    expect(await check()).toStrictEqual({
      allowed: false,
      reason:
        "There is no copy of this device in your User Library yet. Install it first.",
    });
  });

  it("refuses a copy older than this device", async () => {
    expect(await check(frozenDevice("0.0.1"))).toStrictEqual({
      allowed: false,
      reason: `The copy in your User Library (v0.0.1) is older than this device (v${VERSION}). Update it first.`,
    });
  });

  it("refuses a copy that is an earlier release candidate", async () => {
    expect(await check(frozenDevice("2.5.0-rc1"))).toStrictEqual({
      allowed: false,
      reason: `The copy in your User Library (v2.5.0-rc1) is older than this device (v${VERSION}). Update it first.`,
    });
  });

  it("allows a copy that is a later release candidate", async () => {
    const result = await check(frozenDevice("2.5.0-rc3"));

    expect(result.allowed).toBe(true);
  });

  it("refuses a copy that can't be read", async () => {
    const { library, installed, runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    mkdirSync(installed, { recursive: true });

    expect(
      await deviceSwapCheck(
        await deviceInstallStatus(library),
        async () => RUNNING_PING,
      ),
    ).toStrictEqual({
      allowed: false,
      reason: "The copy in your User Library can't be read.",
    });
  });

  it("refuses a copy that names no version", async () => {
    expect(await check(frozenDevice())).toStrictEqual({
      allowed: false,
      reason:
        "The copy in your User Library names no version, so it can't be compared with this device. Update it first.",
    });
  });

  it("refuses when the remote script isn't running, and asks nothing else", async () => {
    expect(await check(frozenDevice(VERSION), NOT_RUNNING_PING)).toStrictEqual({
      allowed: false,
      reason:
        "The remote script isn't running, and it does the swap. Install and enable it above first.",
    });
  });

  it("refuses a remote script too old to have the route", async () => {
    const result = await check(frozenDevice(VERSION), {
      ...RUNNING_PING,
      scriptVersion: "0.0.1",
    });

    expect(result).toStrictEqual({
      allowed: false,
      reason:
        "The remote script running in Live is too old to do the swap. Follow its steps above, then try again.",
    });
  });
});

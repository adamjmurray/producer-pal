// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { installRunningDevicePart } from "../running-device-install-part.ts";
import {
  developmentDevice,
  frozenDevice,
  useDeviceScratch,
} from "./device-install-test-helpers.ts";

// The real check would ask GitHub.
vi.mock(import("../../../helpers/http/update-check.ts"), () => ({
  getUpdate: vi.fn(async () => null),
}));

describe("installRunningDevicePart", () => {
  const scratch = useDeviceScratch();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("installs the running device into the User Library", () => {
    const { library, runFromDownloads, installed } = scratch();
    const bytes = frozenDevice(VERSION);

    runFromDownloads(bytes);

    expect(installRunningDevicePart(library)).toStrictEqual({
      status: "installed",
      path: installed,
      version: VERSION,
    });
    expect(readFileSync(installed).equals(bytes)).toBe(true);
  });

  it("replaces an older copy and says what that means for an open Set", () => {
    const { library, runFromDownloads, installed, put } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    put(installed, frozenDevice("0.0.1"));

    expect(installRunningDevicePart(library)).toStrictEqual({
      status: "updated",
      path: installed,
      version: VERSION,
      detail: expect.stringContaining("keeps the old one until it's reopened"),
    });
  });

  it("says the copy is already current", () => {
    const { library, runFromDownloads, installed, put } = scratch();
    const bytes = frozenDevice(VERSION);

    runFromDownloads(bytes);
    put(installed, bytes);

    expect(installRunningDevicePart(library)).toStrictEqual({
      status: "current",
      path: installed,
      version: VERSION,
    });
  });

  it("keeps a newer copy, saying so, and doesn't call it a failure", () => {
    const { library, runFromDownloads, installed, put } = scratch();
    const newer = frozenDevice("999.0.0");

    runFromDownloads(frozenDevice(VERSION));
    put(installed, newer);

    expect(installRunningDevicePart(library)).toStrictEqual({
      status: "kept",
      path: installed,
      version: VERSION,
      detail: `left the installed device (999.0.0) as it is: it is newer than this device's (${VERSION}).`,
    });
    expect(readFileSync(installed).equals(newer)).toBe(true);
  });

  it("fails for a development device, which can't be copied", () => {
    const { library, runFromDownloads } = scratch();

    runFromDownloads(developmentDevice());

    expect(installRunningDevicePart(library)).toStrictEqual({
      ok: false,
      detail: expect.stringContaining("development device"),
    });
  });

  it("fails before the device has said where its file is", () => {
    const { library } = scratch();

    expect(installRunningDevicePart(library)).toStrictEqual({
      ok: false,
      detail: expect.stringContaining("hasn't said where its file is"),
    });
  });

  it("fails, never throwing, for a library that isn't a folder", () => {
    const { library, runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));

    expect(installRunningDevicePart(`${library}/missing`)).toStrictEqual({
      ok: false,
      detail: expect.stringContaining(
        "Couldn't install the device: Not a folder",
      ),
    });
  });
});

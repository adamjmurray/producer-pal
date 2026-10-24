// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  askDeviceToReport,
  deviceSourcePath,
  isFrozenDevice,
  recordDeviceSource,
  resetDeviceSource,
} from "../device-source.ts";
import {
  developmentDevice,
  frozenDevice,
} from "./device-install-test-helpers.ts";

describe("recordDeviceSource", () => {
  beforeEach(() => {
    resetDeviceSource();
  });

  it("remembers a path, converted to the OS form", () => {
    expect(deviceSourcePath()).toBeNull();
    expect(recordDeviceSource("/Users/me/Producer_Pal.amxd")).toBe(
      "/Users/me/Producer_Pal.amxd",
    );
    expect(deviceSourcePath()).toBe("/Users/me/Producer_Pal.amxd");
  });

  it("converts a path in Max's form", () => {
    // The volume doesn't exist here, so it can't be the boot volume.
    expect(recordDeviceSource("No Such Volume:/a/Producer_Pal.amxd")).toBe(
      "/Volumes/No Such Volume/a/Producer_Pal.amxd",
    );
  });

  it("keeps the earlier path when the new one is unusable", () => {
    recordDeviceSource("/Users/me/Producer_Pal.amxd");

    expect(recordDeviceSource("nonsense")).toBeNull();
    expect(deviceSourcePath()).toBe("/Users/me/Producer_Pal.amxd");
  });
});

describe("askDeviceToReport", () => {
  it("asks V8 through the config outlet", () => {
    vi.mocked(Max.outlet).mockClear();

    askDeviceToReport();

    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "reportDevice",
      1,
    );
  });
});

describe("isFrozenDevice", () => {
  it("recognizes a frozen device by its patcher marker", () => {
    expect(isFrozenDevice(frozenDevice("1.2.3"))).toBe(true);
  });

  it("rejects a development device", () => {
    expect(isFrozenDevice(developmentDevice())).toBe(false);
  });

  it("rejects a file too short to have the marker", () => {
    expect(isFrozenDevice(Buffer.from("mx@c"))).toBe(false);
    expect(isFrozenDevice(Buffer.alloc(0))).toBe(false);
  });
});

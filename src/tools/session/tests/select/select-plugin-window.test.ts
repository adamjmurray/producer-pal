// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
import {
  resetSelectTestState,
  setupSongViewMock,
} from "./select-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { selectSharedUtilsMockBody } =
    await import("./select-test-helpers.ts");

  return selectSharedUtilsMockBody(await importOriginal());
});

describe("select - plugin editor window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  it("opens a plug-in's editor window via devicePath", () => {
    const device = registerMockObject("plugin_0", {
      path: String(livePath.track(0)) + " devices 0",
      type: "PluginDevice",
    });

    setupSongViewMock();

    const result = select({ devicePath: "t0/d0", openPluginWindow: true });

    expect(device.set).toHaveBeenCalledWith("is_editor_open", 1);
    expect(result.selectedDevice).toStrictEqual({
      id: "plugin_0",
      path: "t0/d0",
      pluginWindowOpen: true,
    });
  });

  it("closes a plug-in's editor window when openPluginWindow is false", () => {
    const device = registerMockObject("plugin_0", {
      path: String(livePath.track(0)) + " devices 0",
      type: "PluginDevice",
    });

    setupSongViewMock();

    const result = select({ devicePath: "t0/d0", openPluginWindow: false });

    expect(device.set).toHaveBeenCalledWith("is_editor_open", 0);
    expect(result.selectedDevice?.pluginWindowOpen).toBe(false);
  });

  it("opens a plug-in's editor window when targeting by id", () => {
    const device = registerMockObject("plugin_xyz", {
      path: String(livePath.track(0).device(1)),
      type: "PluginDevice",
    });

    setupSongViewMock();

    select({ id: "id plugin_xyz", openPluginWindow: true });

    expect(device.set).toHaveBeenCalledWith("is_editor_open", 1);
  });

  it("warns and skips when the targeted device is not a plug-in", () => {
    const device = registerMockObject("device_0", {
      path: String(livePath.track(0)) + " devices 0",
      type: "Eq8Device",
    });

    setupSongViewMock();

    const result = select({ devicePath: "t0/d0", openPluginWindow: true });

    expect(device.set).not.toHaveBeenCalledWith(
      "is_editor_open",
      expect.anything(),
    );
    expect(result.selectedDevice?.pluginWindowOpen).toBeUndefined();
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("not a plug-in"),
    );
  });

  it("warns and skips when no device target is provided", () => {
    setupSongViewMock();

    const result = select({ openPluginWindow: true });

    expect(result.selectedDevice).toBeUndefined();
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("requires a plug-in device"),
    );
  });
});

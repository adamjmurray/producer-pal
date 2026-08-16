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
  setupAppViewMock,
  setupSongViewMock,
} from "./select-test-helpers.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { selectSharedUtilsMockBody } =
    await import("./select-test-helpers.ts");

  return selectSharedUtilsMockBody(await importOriginal());
});

// One param covers all three shapes select can act on. Which one a path names
// is decided by the grammar, not by which param the caller reached for.
describe("select path param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  it("selects a session position", () => {
    const clipSlot = registerMockObject("clipslot_0_1", {
      path: livePath.track(0).clipSlot(1),
      type: "ClipSlot",
      properties: { has_clip: 0 },
    });
    const songView = setupSongViewMock();

    setupAppViewMock();

    select({ path: "t0/s1" });

    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      `id ${clipSlot.id}`,
    );
  });

  it("selects a device", () => {
    registerMockObject("device_at_path", {
      path: String(livePath.track(1)) + " devices 0",
      type: "Device",
    });
    const songView = setupSongViewMock();

    const result = select({ path: "t1/d0" });

    expect(songView.call).toHaveBeenCalledWith(
      "select_device",
      "id device_at_path",
    );
    expect(result.selectedDevice?.path).toBe("t1/d0");
  });

  it("selects a bare track", () => {
    registerMockObject("track_2", {
      path: livePath.track(2),
      type: "Track",
    });
    const songView = setupSongViewMock();

    select({ path: "t2" });

    expect(songView.set).toHaveBeenCalledWith("selected_track", "id track_2");
  });

  it("rejects the unprefixed spelling with the fix", () => {
    expect(() => select({ path: "0/1" })).toThrow('did you mean "t0/s1"?');
  });

  it("refuses path alongside a param it replaced", () => {
    expect(() => select({ path: "t0/s1", slot: "0/1" })).toThrow(
      "select failed: path and slot/devicePath both name a target",
    );
    expect(() => select({ path: "t0/d1", devicePath: "t0/d1" })).toThrow(
      "select failed: path and slot/devicePath both name a target",
    );
  });
});

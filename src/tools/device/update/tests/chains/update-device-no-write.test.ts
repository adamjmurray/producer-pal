// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

const NOTHING_TO_UPDATE =
  "nothing to update: id and path only name the targets; also send a param to change";

describe("updateDevice - a call that asks nothing of its targets", () => {
  const selectMock = setupSelectMock();
  let device123: RegisteredMockObject;

  beforeEach(() => {
    mockNonExistentObjects();
    device123 = registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
  });

  it.each([
    { id: "123" },
    { path: "t0/d0" },
    { id: "123", focus: false },
    { id: "123", wrapInRack: false },
    { id: "123", toPath: "" },
    { id: "123", force: true },
    { id: "123", params: [], actions: [] },
  ])("refuses %j, writing nothing", (args) => {
    expect(() => updateDevice(args)).toThrow(NOTHING_TO_UPDATE);
    expect(device123.set).not.toHaveBeenCalled();
  });

  it.each([
    ["name", { name: "A" }],
    ["mute false", { mute: false }],
    ["toPath", { toPath: "t0/d1" }],
  ])("does not refuse %s", (_label, extra) => {
    expect(() => updateDevice({ id: "123", ...extra })).not.toThrow(
      NOTHING_TO_UPDATE,
    );
  });

  it("counts focus: true as work, and selects the device", () => {
    updateDevice({ id: "123", focus: true });

    expect(selectMock.get()).toHaveBeenCalledWith({
      id: "123",
      detailView: "device",
    });
  });
});
